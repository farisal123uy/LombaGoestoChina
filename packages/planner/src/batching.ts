import { paymentPlanSchema, type PaymentPlan, type PaymentTask, type PolicySnapshot } from "@guardian-wallet/shared";

/** Aggregate already approved plans; batching never grants a fresh model decision. */
export function selectPaymentBatch(primary: PaymentTask, candidates: PaymentTask[], state: PolicySnapshot, maxSize: number) {
  if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > 10) throw new Error("INVALID_BATCH_SIZE");
  if (!state.installed || state.paused) throw new Error("POLICY_INACTIVE");
  const base = paymentPlanSchema.parse(primary.plan);
  const remaining = [BigInt(state.balanceUnits) - BigInt(state.protectedBalanceUnits), BigInt(state.dailyLimitUnits) - BigInt(state.spentUnits)].reduce((a, b) => a < b ? a : b);
  let total = 0n, validUntil = Math.min(state.validUntil, state.observedAt + 120);
  const selected: PaymentTask[] = [], ids = new Set<string>();
  for (const task of [primary, ...candidates]) {
    if (selected.length >= maxSize) break;
    const parsed = paymentPlanSchema.safeParse(task.plan);
    if (!parsed.success) { if (task.id === primary.id) throw new Error("INVALID_BATCH_PRIMARY_PLAN"); continue; }
    const p = parsed.data, q = task.quote, planned = p.quotes[0];
    const invoiceKey = `${q.account.toLowerCase()}:${q.providerId}:${q.invoiceId}`;
    const compatible = task.status === "planned" && task.owner.toLowerCase() === primary.owner.toLowerCase() && task.chainId === state.chainId && p.chainId === state.chainId && p.taskId === task.id
      && p.account.toLowerCase() === state.account.toLowerCase() && p.guardianAddress.toLowerCase() === state.guardianAddress.toLowerCase()
      && q.account.toLowerCase() === state.account.toLowerCase() && q.token.toLowerCase() === state.token.toLowerCase() && p.policyVersion === state.policyVersion
      && p.origin === base.origin && p.model?.id === base.model?.id && p.model?.provider === base.model?.provider
      && p.quotes.length === 1 && planned && Object.entries(q).every(([key, value]) => planned[key as keyof typeof planned] === value)
      && state.observedAt >= state.validAfter && state.observedAt < Math.min(p.validUntil, q.validUntil, state.validUntil)
      && BigInt(q.amountUnits) <= BigInt(state.perPaymentLimitUnits) && !ids.has(invoiceKey) && !selected.some((item) => item.id === task.id);
    if (!compatible || total + BigInt(q.amountUnits) > remaining) {
      if (task.id === primary.id) throw new Error("BATCH_PRIMARY_STALE_OR_OUTSIDE_BUDGET");
      continue;
    }
    selected.push(task); ids.add(invoiceKey); total += BigInt(q.amountUnits);
    validUntil = Math.min(validUntil, p.validUntil, q.validUntil);
  }
  const plan: PaymentPlan = paymentPlanSchema.parse({ ...base, observedAt: state.observedAt, observedBlockNumber: state.observedBlockNumber, observedBlockHash: state.observedBlockHash,
    validUntil, quotes: selected.map((task) => task.quote), batchTaskIds: selected.map((task) => task.id), summary: `Settle ${selected.length} authenticated invoice(s) within the existing policy. Batching is deterministic.` });
  return { tasks: selected, plan, totalUnits: total.toString() };
}
