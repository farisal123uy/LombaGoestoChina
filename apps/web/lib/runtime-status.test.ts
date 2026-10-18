import { describe, expect, it } from "vitest";
import { coordinatorStatus, dashboardStatus } from "./runtime-status";

describe("runtime status copy", () => {
  it("separates an unreachable API from an unconfigured runtime", () => {
    expect(dashboardStatus({ walletAvailable: false, authenticated: false, unreachable: true })[0]?.value).toBe("Unavailable");
    expect(dashboardStatus({ status: { financialConfigured: false, providerConfigured: false, executionEnabled: false }, walletAvailable: true, authenticated: false, unreachable: false })[0]?.value).toBe("Configuration required");
  });

  it("keeps local scheduler state distinct from owner authorization", () => {
    const status = dashboardStatus({ status: { financialConfigured: true, providerConfigured: true, executionEnabled: true }, walletAvailable: true, authenticated: true, unreachable: false });
    expect(status.find((item) => item.label === "Owner")?.value).toBe("Authorized");
    expect(status.find((item) => item.label === "Scheduler")?.value).toBe("Running");
    expect(status.find((item) => item.label === "Scheduler")?.detail).toContain("does not change on-chain policy");
  });

  it("shows coordinator absence as a prerequisite", () => {
    const status = coordinatorStatus({ available: false, loggedIn: false });
    expect(status[0]?.value).toBe("Unavailable");
    expect(status[0]?.detail).toContain("npm run onboarding");
  });
});
