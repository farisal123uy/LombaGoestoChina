const messages: Record<string, string> = {
  OWNER_NOT_REGISTERED: "This wallet is not the registered owner for this deployment.",
  AUTH_REQUIRED: "Your sign-in expired. Sessions last 15 minutes; sign in again.",
  SESSION_EXPIRED: "Your sign-in expired. Sessions last 15 minutes; sign in again.",
  FINANCIAL_SERVICES_NOT_CONFIGURED: "The backend is not configured on this machine.",
};

export function plainErrorMessage(error: string): string {
  const code = Object.keys(messages).find((candidate) => error.includes(candidate));
  return code ? messages[code]! : error;
}
