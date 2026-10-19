import type { PaymentClaim, PaymentStore } from "@guardian-wallet/database";
import { selectPaymentBatch, type PaymentPlanner } from "@guardian-wallet/planner";
import { getPaymentId, type EscrowAction, type PaymentExecutionDriver, type PaymentFulfillment } from "@guardian-wallet/wallet";

/** One tick, no overlapping loop and no automatic new-nonce retry. */
export class PaymentWorker {
  private readonly maxBatchSize: number;
  private readonly batchWindowMs: number;
  private readonly settlementMode: "direct" | "escrow";
  private readonly escrowWindowSeconds: number;
  private readonly clock: () => number;
  constructor(private readonly store: PaymentStore, private readonly planner: PaymentPlanner,
    private readonly driver: PaymentExecutionDriver, private readonly accountKey: string, private readonly workerId: string,
    private readonly fulfillment?: PaymentFulfillment, options: { maxBatchSize?: number; batchWindowMs?: number; settlementMode?: "direct" | "escrow"; escrowWindowSeconds?: number; clock?: () => number } = {}) {
    this.maxBatchSize = options.maxBatchSize ?? 1; this.batchWindowMs = options.batchWindowMs ?? 0; this.clock = options.clock ?? Date.now;
    this.settlementMode = options.settlementMode ?? "direct"; this.escrowWindowSeconds = options.escrowWindowSeconds ?? 600;
    if (!Number.isInteger(this.maxBatchSize) || this.maxBatchSize < 1 || this.maxBatchSize > 10 || !Number.isInteger(this.batchWindowMs) || this.batchWindowMs < 0 || this.batchWindowMs > 30000) throw new Error("INVALID_BATCH_CONFIGURATION");
    if (!Number.isInteger(this.escrowWindowSeconds) || this.escrowWindowSeconds < 30 || this.escrowWindowSeconds > 86400 || (this.settlementMode === "escrow" && this.maxBatchSize !== 1)) throw new Error("INVALID_ESCROW_CONFIGURATION");
  }

  async runOnce() {
    const claim = await this.store.claim(this.accountKey, this.workerId, 90000, this.maxBatchSize);
    if (!claim) return "idle";
    try {
      if (claim.task.status === "escrowed") return await this.runEscrowFulfillment(claim);
      if (["paid", "service_pending"].includes(claim.task.status)) {
        try {
          const paid = await this.store.getAttempt(claim.task.id, claim.task.owner);
          if (!this.fulfillment || paid?.status !== "confirmed" || !paid.transactionHash) throw new Error("FULFILLMENT_NOT_CONFIGURED_OR_PAYMENT_NOT_CONFIRMED");
          const receipt = await this.fulfillment.fulfill(claim.task, paid);
          await this.store.deliveryResult(claim, receipt);
          return "completed";
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          await this.store.deliveryResult(claim, undefined, /^[A-Z0-9_]{1,100}$/.test(message) ? message : "SERVICE_DELIVERY_PENDING");
          return claim.task.status;
        }
      }
      if (claim.attempt) {
        if (!claim.task.plan) throw new Error("MISSING_DURABLE_PLAN");
        const result = await this.driver.reconcile(claim.attempt, claim.task.plan);
        if (result.status === "confirmed" || result.status === "failed") {
          const status = result.status === "confirmed" && claim.attempt.settlementMode === "escrow" ? "escrowed" : result.status === "confirmed" ? "paid" : "needs_owner";
          await this.store.finish(claim, { ...claim.attempt, ...result, status: result.status, reason: result.reason }, status);
        } else if (result.status === "needs_review") {
          await this.store.updateAttempt(claim, { ...claim.attempt, status: "needs_review", reason: result.reason });
          await this.store.setPaused(this.accountKey, true);
        }
        return result.status;
      }
      // Live AI runs in the API process, never alongside the executor secret.
      const outcome = claim.task.plan
        ? { status: "planned" as const, plan: claim.task.plan }
        : await this.planner.plan(claim.task, await this.driver.snapshot(claim.task));
      if (outcome.status !== "planned") {
        await this.store.updateTask(claim, outcome.status, outcome.reason);
        return outcome.status;
      }
      // A stalled/lagging RPC must not keep fee/sponsorship checks alive forever.
      // Durable unknown attempts are reconciled above even after this deadline.
      if (outcome.plan.validUntil * 1000 <= this.clock()) throw new Error("EXPIRED_PLAN");
      await this.store.updateTask(claim, "planned", undefined, outcome.plan);
      const batch = this.maxBatchSize > 1 ? selectPaymentBatch(claim.task, claim.batchCandidates || [], await this.driver.snapshot(claim.task), this.maxBatchSize) : undefined;
      if (this.settlementMode === "escrow" && batch?.tasks.length) throw new Error("ESCROW_BATCH_NOT_SUPPORTED");
      const plan = batch?.plan || outcome.plan;
      if (batch && batch.tasks.length < this.maxBatchSize && this.clock() < Date.parse(claim.task.createdAt) + this.batchWindowMs && plan.validUntil * 1000 > this.clock() + 5000) return "waiting_batch";
      await this.driver.validate(plan);
      const prepared = await this.driver.prepare(plan);
      if ((prepared.attempt.settlementMode ?? "direct") !== this.settlementMode) throw new Error("SETTLEMENT_MODE_MISMATCH");
      // Durable exact payload/hash BEFORE calling the network. A crash after this
      // line is reconciled; another worker must never start a new payment instead.
      await this.store.prepare(claim, prepared.attempt, prepared.signedPayload, batch);
      await this.store.assertLease(claim);
      await this.store.updateAttempt(claim, { ...prepared.attempt, status: "submitting" });
      try {
        const hash = await this.driver.submit(prepared.signedPayload);
        if (hash !== prepared.attempt.userOperationHash) throw new Error("BUNDLER_HASH_MISMATCH");
        await this.store.updateAttempt(claim, { ...prepared.attempt, status: "submitted" });
        return "submitted";
      } catch {
        await this.store.updateAttempt(claim, { ...prepared.attempt, status: "unknown", reason: "SEND_OUTCOME_UNCERTAIN" });
        return "unknown";
      }
    } catch (error) {
      if (claim.task.status === "escrowed") {
        const message = error instanceof Error ? error.message : "";
        try { await this.store.deferEscrowTask(claim, /^[A-Z0-9_]{1,100}$/.test(message) ? message : "ESCROW_RECOVERY_PENDING"); } catch { /* Lease may already have moved to another worker. */ }
        return "escrow_recovery_pending";
      }
      if (claim.attempt) {
        // Never retry signing/sending after a durable attempt exists.
        await this.store.setPaused(this.accountKey, true);
        throw error;
      }
      const message = error instanceof Error ? error.message : "";
      const reason = /^[A-Z0-9_]{1,80}$/.test(message) ? message : "PREFLIGHT_FAILED";
      await this.store.updateTask(claim, reason === "WAITING_FEE" ? "waiting" : "needs_owner", reason.slice(0, 200));
      return reason === "WAITING_FEE" ? "waiting" : "needs_owner";
    } finally {
      await this.store.release(claim);
    }
  }

  private async runEscrowFulfillment(claim: PaymentClaim): Promise<string> {
    if (!claim.task.escrow || !claim.task.plan) throw new Error("ESCROW_TASK_STATE_MISSING");
    if (this.settlementMode !== "escrow" || !this.driver.prepareEscrowAction || !this.driver.reconcileEscrowAction || !this.fulfillment?.fulfillEscrow || !this.fulfillment.activateEscrow) {
      await this.store.deferEscrowTask(claim, "ESCROW_MODE_REQUIRED");
      return "escrow_waiting_configuration";
    }
    try {
      const payment = await this.store.getAttempt(claim.task.id, claim.task.owner);
      if (!payment || payment.status !== "confirmed" || payment.settlementMode !== "escrow" || !payment.transactionHash) throw new Error("ESCROW_LOCK_NOT_CONFIRMED");
      const previous = await this.store.getEscrowOperation(claim.task.id, claim.task.owner);
      if (previous?.record.status === "needs_review") {
        await this.store.setPaused(this.accountKey, true);
        return "escrow_needs_review";
      }
      if (previous && ["prepared", "submitting", "submitted", "unknown"].includes(previous.record.status)) {
        const result = await this.driver.reconcileEscrowAction(previous.record, claim.task.plan);
        if (result.status === "confirmed") {
          const record = { ...previous.record, ...result, status: "confirmed" as const };
          if (record.action === "release") {
            if (!record.transactionHash || !this.fulfillment.activateEscrow) throw new Error("ESCROW_ACTIVATOR_NOT_CONFIGURED");
            if (!record.delivery) throw new Error("ESCROW_DELIVERY_RECORD_MISSING");
            await this.fulfillment.activateEscrow(claim.task, record.transactionHash, record.delivery);
          }
          await this.store.completeEscrowOperation(claim, previous.id, record);
          return record.action === "release" ? "completed" : "refunded";
        }
        if (result.status === "failed") {
          await this.store.updateEscrowOperation(claim, previous.id, { ...previous.record, ...result, status: "failed" });
          await this.store.deferEscrowTask(claim, result.reason || "ESCROW_ACTION_FAILED", 3000);
          return "escrow_action_failed";
        }
        if (result.status === "needs_review") {
          await this.store.updateEscrowOperation(claim, previous.id, { ...previous.record, status: "needs_review", reason: result.reason });
          await this.store.setPaused(this.accountKey, true);
          await this.store.deferEscrowTask(claim, result.reason || "ESCROW_ACTION_NEEDS_REVIEW", 10000);
          return "escrow_needs_review";
        }
        await this.store.deferEscrowTask(claim, result.reason || "ESCROW_ACTION_PENDING", 3000);
        return "escrow_action_pending";
      }
      if (previous?.record.status === "confirmed") {
        if (previous.record.action === "release") {
          if (!previous.record.transactionHash || !previous.record.delivery || !this.fulfillment.activateEscrow) throw new Error("ESCROW_ACTIVATOR_NOT_CONFIGURED");
          await this.fulfillment.activateEscrow(claim.task, previous.record.transactionHash, previous.record.delivery);
        }
        await this.store.completeEscrowOperation(claim, previous.id, previous.record);
        return previous.record.action === "release" ? "completed" : "refunded";
      }

      let action: EscrowAction;
      if (Math.floor(this.clock() / 1000) > claim.task.escrow.refundAfter) {
        action = { kind: "refund", paymentId: getPaymentId(claim.task.chainId, claim.task.quote) };
      } else {
        const fulfillment = await this.fulfillment.fulfillEscrow(claim.task, payment);
        action = { kind: "release", attestation: fulfillment.attestation, delivery: fulfillment.delivery, lockTransactionHash: payment.transactionHash };
      }
      const prepared = await this.driver.prepareEscrowAction(claim.task.plan, action);
      await this.store.prepareEscrowOperation(claim, action.kind, prepared.attempt, prepared.signedPayload);
      const stored = await this.store.getEscrowOperation(claim.task.id, claim.task.owner);
      if (!stored) throw new Error("ESCROW_OPERATION_NOT_PERSISTED");
      await this.store.assertLease(claim);
      await this.store.updateEscrowOperation(claim, stored.id, { ...prepared.attempt, status: "submitting" });
      try {
        const hash = await this.driver.submit(prepared.signedPayload);
        if (hash.toLowerCase() !== prepared.attempt.userOperationHash.toLowerCase()) throw new Error("BUNDLER_HASH_MISMATCH");
        await this.store.updateEscrowOperation(claim, stored.id, { ...prepared.attempt, status: "submitted" });
      } catch {
        await this.store.updateEscrowOperation(claim, stored.id, { ...prepared.attempt, status: "unknown", reason: "SEND_OUTCOME_UNCERTAIN" });
      }
      await this.store.deferEscrowTask(claim, action.kind === "release" ? "ESCROW_RELEASE_PENDING" : "ESCROW_REFUND_PENDING", 3000);
      return action.kind === "release" ? "escrow_release_submitted" : "escrow_refund_submitted";
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      await this.store.deferEscrowTask(claim, /^[A-Z0-9_]{1,100}$/.test(message) ? message : "ESCROW_FULFILLMENT_PENDING");
      return "escrow_waiting";
    }
  }
}
