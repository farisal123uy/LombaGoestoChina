import { createHash } from "node:crypto";

export class QwenRateLimitError extends Error {
  constructor(code: "QWEN_RATE_LIMITED" | "QWEN_DAILY_LIMIT", public readonly retryAfterSeconds: number) { super(code); }
}
interface Budget { day: number; daily: number; dailyTokens: number; cooldownUntil: number; calls: { at: number; tokens: number }[]; }
const budgets = new Map<string, Budget>();

/** Process-wide quota shared by buyer, provider and review workspaces using a key. */
export function cloudQuota(apiKey: string) {
  const id = createHash("sha256").update(apiKey).digest("hex");
  let budget = budgets.get(id);
  if (!budget) { budget = { day: -1, daily: 0, dailyTokens: 0, cooldownUntil: 0, calls: [] }; budgets.set(id, budget); }
  return {
    reserve(tokens: number) {
      const now = Date.now(), day = Math.floor(now / 86400000);
      if (budget.day !== day) { budget.day = day; budget.daily = 0; budget.dailyTokens = 0; }
      budget.calls = budget.calls.filter((call) => call.at > now - 60000);
      if (now < budget.cooldownUntil) throw new QwenRateLimitError("QWEN_RATE_LIMITED", Math.ceil((budget.cooldownUntil - now) / 1000));
      if (budget.daily >= 800 || budget.dailyTokens + tokens > 180000) throw new QwenRateLimitError("QWEN_DAILY_LIMIT", Math.ceil(((day + 1) * 86400000 - now) / 1000));
      if (budget.calls.length >= 20 || budget.calls.reduce((sum, call) => sum + call.tokens, 0) + tokens > 7000) throw new QwenRateLimitError("QWEN_RATE_LIMITED", 60);
      const reservation = { at: now, tokens }; budget.calls.push(reservation); budget.daily++; budget.dailyTokens += tokens;
      return { observed: (actual: number) => { const difference = actual - reservation.tokens; if (budget.day === day) budget.dailyTokens = Math.max(0, budget.dailyTokens + difference); reservation.tokens = actual; } };
    },
    coolDown(seconds: number) { budget.cooldownUntil = Math.max(budget.cooldownUntil, Date.now() + Math.min(86400, Math.max(1, seconds)) * 1000); },
  };
}
