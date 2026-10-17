import type { PaymentStore } from "@guardian-wallet/database";
import type { PaymentPlanner } from "@guardian-wallet/planner";
import type { PaymentExecutionDriver, PaymentFulfillment } from "@guardian-wallet/wallet";

/** One tick, no overlapping loop and no automatic new-nonce retry. */
export class PaymentWorker {
  constructor(private readonly store: PaymentStore, private readonly planner: PaymentPlanner,
    private readonly driver: PaymentExecutionDriver, private readonly accountKey: string, private readonly workerId: string,
    private readonly fulfillment?: PaymentFulfillment) {}

  async runOnce() {
    const claim = await this.store.claim(this.accountKey, this.workerId);
    if (!claim) return "idle";
    try {
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
          await this.store.finish(claim, { ...claim.attempt, ...result, status: result.status, reason: result.reason }, result.status === "confirmed" ? "paid" : "needs_owner");
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
      await this.store.updateTask(claim, "planned", undefined, outcome.plan);
      await this.driver.validate(outcome.plan);
      const prepared = await this.driver.prepare(outcome.plan);
      // Durable exact payload/hash BEFORE calling the network. A crash after this
      // line is reconciled; another worker must never start a new payment instead.
      await this.store.prepare(claim, prepared.attempt, prepared.signedPayload);
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
}
