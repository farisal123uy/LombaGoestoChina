import type { FastifyInstance } from "fastify";
import type { Address } from "viem";
import { accountKey } from "@guardian-wallet/database";
import { assessWalletRisk, buildWalletOverview, interpretWalletInstruction, reservesBudget } from "@guardian-wallet/planner";
import {
  assistantRequestSchema, executeWalletPlanSchema,
  type AgentExchange, type PaymentPlan, type PaymentTask, type ReviewedWalletPlans,
  type WalletAssistantResponse, type WalletExecutionResponse, type WalletRiskCheck,
} from "@guardian-wallet/shared";
import type { FinancialApi } from "./app.js";
import { ApiError } from "./auth.js";

export interface ProcurementResult { status: string; task?: PaymentTask; exchange?: AgentExchange[]; reason?: string; }
type Context = FinancialApi & { owner: Address };

export function registerWalletAssistant(app: FastifyInstance, context: (header?: string) => Context, procure: (header: string | undefined, body: unknown, draftOnly?: boolean) => Promise<ProcurementResult>) {
  async function snapshot(ctx: Context) {
    const state = await ctx.readPolicy();
    if (state.chainId !== ctx.chainId || state.account.toLowerCase() !== ctx.accountAddress.toLowerCase()) throw new ApiError(503, "CHAIN_ACCOUNT_MISMATCH");
    if (!ctx.readAssetMetadata) throw new ApiError(503, "ASSET_READER_NOT_CONFIGURED");
    const key = accountKey(ctx.chainId, ctx.accountAddress);
    const [tasks, attempts, metadata, schedulerPaused] = await Promise.all([
      ctx.store.listAccountTasks(ctx.owner, key), ctx.store.listActiveAttempts(key), ctx.readAssetMetadata(state), ctx.store.isPaused(key),
    ]);
    const overview = buildWalletOverview(state, tasks, metadata, schedulerPaused);
    const risk = assessWalletRisk(state, overview, tasks, attempts, ctx.clock?.());
    return { state, tasks, attempts, overview, risk };
  }

  async function reviewPayments(ctx: Context, taskIds: string[], instruction: string): Promise<ReviewedWalletPlans> {
    const initial = await snapshot(ctx), plans: PaymentPlan[] = [], blockers: WalletRiskCheck[] = [];
    if (!ctx.validatePlan) throw new ApiError(503, "PAYMENT_VALIDATOR_NOT_CONFIGURED");
    if (taskIds.length > 10 || new Set(taskIds).size !== taskIds.length) throw new ApiError(400, "INVALID_TASK_SELECTION");
    const selected = taskIds.map((id) => {
      const task = initial.tasks.find((value) => value.id === id);
      if (!task) throw new ApiError(404, "TASK_NOT_FOUND");
      return task;
    });
    for (const task of selected) {
      const operation = await ctx.store.getAttempt(task.id, ctx.owner);
      if (operation || !["draft", "queued", "planned", "waiting", "needs_owner", "rejected"].includes(task.status)) {
        blockers.push({ code: "TASK_ALREADY_SUBMITTED", severity: "critical", message: "This task already has an operation or settlement and cannot be paid again.", taskId: task.id });
        continue;
      }
      const outcome = await ctx.planner.plan({ ...task, instruction: task.instruction === instruction ? instruction : JSON.stringify({ originalGoal: task.instruction, walletRequest: instruction }) }, initial.state);
      if (outcome.status !== "planned") {
        blockers.push({ code: "PLANNER_DEFERRED", severity: "warning", message: outcome.reason, taskId: task.id });
        continue;
      }
      try { await ctx.validatePlan(outcome.plan); plans.push(outcome.plan); }
      catch { blockers.push({ code: "PAYMENT_VALIDATION_FAILED", severity: "critical", message: "Current on-chain quote, recipient, policy or budget validation failed.", taskId: task.id }); }
    }
    // Re-read after all inference/validation. A plan must not adopt a policy change
    // silently or spend capacity reserved by another request while the model ran.
    const current = await snapshot(ctx);
    blockers.push(...current.risk.checks.filter((check) => check.severity === "critical" && !check.taskId));
    if (current.attempts.length) blockers.push({ code: "OPERATION_IN_FLIGHT", severity: "warning", message: "Reconcile the active operation before queueing another payment." });
    const now = ctx.clock?.() ?? Math.floor(Date.now() / 1000);
    for (const plan of plans) if (plan.policyVersion !== current.state.policyVersion || plan.validUntil <= now || plan.quotes.some((quote) => quote.validUntil <= now)) blockers.push({ code: "STALE_PLAN", severity: "critical", message: "State changed or the plan expired during inference. Request a fresh review.", taskId: plan.taskId });
    const total = selected.reduce((sum, task) => sum + BigInt(task.quote.amountUnits), 0n);
    const other = current.tasks.filter((task) => !taskIds.includes(task.id) && reservesBudget(task) && task.quote.token.toLowerCase() === current.state.token.toLowerCase()).reduce((sum, task) => sum + BigInt(task.quote.amountUnits), 0n);
    const balanceAfter = BigInt(current.state.balanceUnits) - total - other;
    const dailyAfter = BigInt(current.state.dailyLimitUnits) - BigInt(current.state.spentUnits) - total - other;
    if (balanceAfter < BigInt(current.state.protectedBalanceUnits)) blockers.push({ code: "PROTECTED_BALANCE", severity: "critical", message: "These invoices plus existing commitments would breach the protected reserve." });
    if (dailyAfter < 0n) blockers.push({ code: "DAILY_LIMIT", severity: "critical", message: "These invoices plus existing commitments exceed the remaining UTC-day budget." });
    return { plans, review: {
      status: blockers.length ? "blocked" : "ready", taskIds, totalUnits: total.toString(), balanceAfterUnits: balanceAfter.toString(), remainingDailyAfterUnits: dailyAfter.toString(), blockers,
      items: selected.map((task) => ({ taskId: task.id, recipient: task.quote.recipient, amountUnits: task.quote.amountUnits, invoiceId: task.quote.invoiceId })),
    } };
  }

  app.get("/v1/assets", async (request) => ({ overview: (await snapshot(context(request.headers.authorization))).overview }));
  app.get("/v1/risk", async (request) => {
    const current = await snapshot(context(request.headers.authorization));
    return { overview: current.overview, risk: current.risk };
  });
  app.post("/v1/assistant", async (request): Promise<WalletAssistantResponse> => {
    const ctx = context(request.headers.authorization), input = assistantRequestSchema.parse(request.body);
    const qwen = ctx.assistant?.qwen ?? ctx.procurement?.qwen;
    if (!qwen) throw new ApiError(503, "WALLET_AI_NOT_CONFIGURED");
    const before = await snapshot(ctx);
    if (input.taskIds?.some((id) => !before.tasks.some((task) => task.id === id))) throw new ApiError(404, "TASK_NOT_FOUND");
    const intent = await interpretWalletInstruction(qwen, input.instruction, before.tasks, input.taskIds);
    let task: PaymentTask | undefined;
    let reviewed: ReviewedWalletPlans | undefined;
    if (intent.action === "procure_database") {
      const result = await procure(request.headers.authorization, { requestId: input.requestId, instruction: input.instruction }, true);
      task = result.task;
      if (task) reviewed = await reviewPayments(ctx, [task.id], input.instruction);
      else intent.summary = result.reason ?? "The provider did not issue an executable invoice.";
    } else if (intent.action === "plan_payments") {
      const ids = input.taskIds ?? intent.taskIds;
      if (ids.length && new Set(ids).size === ids.length) reviewed = await reviewPayments(ctx, ids, input.instruction);
      else intent.summary = "Select one to ten existing invoice tasks, or ask Astra to obtain a database quote first.";
    }
    const current = await snapshot(ctx);
    return { intent: intent.action, interpretation: intent.summary, origin: "live_model", modelId: qwen.modelId, overview: current.overview, risk: current.risk, ...(task ? { task } : {}), ...(reviewed ? { paymentReview: reviewed.review } : {}) };
  });
  app.post("/v1/assistant/execute", async (request): Promise<WalletExecutionResponse> => {
    const ctx = context(request.headers.authorization), input = executeWalletPlanSchema.parse(request.body);
    const key = accountKey(ctx.chainId, ctx.accountAddress);
    const tasks = await Promise.all(input.taskIds.map(async (id) => {
      const task = await ctx.store.getTask(id, ctx.owner);
      if (!task || accountKey(task.chainId, task.quote.account) !== key) throw new ApiError(404, "TASK_NOT_FOUND");
      return task;
    }));
    const attempts = await Promise.all(tasks.map((task) => ctx.store.getAttempt(task.id, ctx.owner)));
    if (attempts.every(Boolean)) return { status: "already_submitted", tasks, schedulerPaused: await ctx.store.isPaused(key) };
    const reviewed = await reviewPayments(ctx, input.taskIds, input.instruction);
    if (reviewed.review.status !== "ready") return { status: "blocked", tasks, schedulerPaused: await ctx.store.isPaused(key), review: reviewed.review };
    const fresh = await snapshot(ctx);
    // Do not clear a pause, resume expired permissions or mark a task as paid here.
    const capacity = [BigInt(fresh.overview.spendableBalanceUnits), BigInt(fresh.overview.remainingDailyUnits)].reduce((a, b) => a < b ? a : b);
    const queued = tasks.map((task) => ({ ...task, status: "planned" as const, reason: undefined, plan: reviewed.plans.find((plan) => plan.taskId === task.id)! }));
    try { await ctx.store.queueReviewedTasks(queued, capacity.toString()); }
    catch (error) {
      if (error instanceof Error && ["TASK_BUSY", "QUEUE_BUDGET_CHANGED"].includes(error.message)) throw new ApiError(409, error.message);
      throw error;
    }
    return { status: "queued", tasks: queued, schedulerPaused: await ctx.store.isPaused(key), review: reviewed.review };
  });
}
