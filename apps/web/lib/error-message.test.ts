import { describe, expect, it } from "vitest";
import { plainErrorMessage } from "./error-message";

describe("plainErrorMessage", () => {
  it.each([
    ["OWNER_NOT_REGISTERED", "This wallet is not the registered owner for this deployment."],
    ["AUTH_REQUIRED", "Your sign-in expired. Sessions last 15 minutes; sign in again."],
    ["SESSION_EXPIRED", "Your sign-in expired. Sessions last 15 minutes; sign in again."],
    ["FINANCIAL_SERVICES_NOT_CONFIGURED", "The backend is not configured on this machine."],
  ])("maps %s", (code, expected) => expect(plainErrorMessage(code)).toBe(expected));

  it("preserves unknown errors", () => expect(plainErrorMessage("Unexpected upstream failure")).toBe("Unexpected upstream failure"));
});
