export const walletApiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
export const onboardingBase = (process.env.NEXT_PUBLIC_ONBOARDING_URL || "http://127.0.0.1:4100").replace(/\/$/, "");
export const sessionInvalidEvent = "guardian-owner-session-invalid";

export function explainWalletError(code: string, retryAfterSeconds?: number): string {
  const messages: Record<string, string> = {
    TASK_NOT_FOUND: "This invoice is no longer available for the active wallet. Refresh the task list and select a current invoice, or request a new database quote.",
    AUTH_REQUIRED: "Sign in with your owner wallet to continue.",
    SESSION_EXPIRED: "Your 15-minute sign-in expired or the service restarted. Sign in again; your deployed wallet and Astra delegation are still saved.",
    DAILY_LIMIT: "These invoices exceed the remaining daily payment budget. It resets at 00:00 UTC; choose fewer invoices or wait for the reset.",
    DAILY_BUDGET_EXHAUSTED: "The daily payment budget is used up. It resets at 00:00 UTC. This is separate from the AI API quota.",
    PROTECTED_BALANCE: "This payment would spend the protected reserve. Reduce the payment or fund the wallet above its reserve.",
    POLICY_EXPIRED: "The payment policy is outside its authorized time window. The owner must review and renew the policy; signing in again does not renew it.",
    EXPIRED_PLAN: "The payment plan expired. Request a fresh invoice and review it again.",
    EXPIRED_QUOTE: "The provider invoice expired. Request a fresh database quote.",
    EXPIRED: "The invoice or payment permission expired. Check the policy expiry, then request a fresh quote if the policy is still active.",
    POLICY_BUDGET: "This invoice exceeds a policy boundary: the per-payment limit, remaining daily budget or protected reserve. Check the balances and limits above.",
    POLICY_INACTIVE: "The on-chain payment policy is missing or paused. The owner must review the policy before payments can run.",
    EXPIRED_INVOICE: "An invoice has expired. Select its task below and discard it if it has no submitted operation, then request a fresh database quote.",
    WAITING_FEE: "Execution is waiting for acceptable gas fees. Follow this task instead of creating a duplicate payment.",
    QUEUE_BUDGET_CHANGED: "The available budget changed while reviewing. Refresh and preview the selected invoices again.",
    TASK_BUSY: "The worker is already processing this invoice. Refresh its status before trying again.",
    QWEN_DAILY_LIMIT: "The free AI API daily quota is exhausted. Wait for its quota reset; the wallet payment budget is a separate limit.",
    QWEN_UNAVAILABLE: "The AI service is unavailable. Check the model service and try again later.",
  };
  if (code === "QWEN_RATE_LIMITED") return `The free AI API is rate-limited. Retry after ${retryAfterSeconds || 60} seconds. This is separate from the wallet payment budget.`;
  return messages[code] || code;
}

export function walletRequestError(base: string, status: number, value: { error?: unknown; retryAfterSeconds?: number }, authenticated = false) {
  if (status === 401 && authenticated && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(sessionInvalidEvent, { detail: { base } }));
  return new Error(explainWalletError(typeof value.error === "string" ? value.error : "REQUEST_FAILED", value.retryAfterSeconds));
}
