export interface RuntimeStatus {
  financialConfigured: boolean;
  providerConfigured: boolean;
  executionEnabled: boolean;
}

export interface StatusItem {
  label: string;
  value: string;
  detail: string;
}

export function dashboardStatus(input: {
  status?: RuntimeStatus;
  walletAvailable: boolean;
  authenticated: boolean;
  unreachable: boolean;
}): StatusItem[] {
  const { status, walletAvailable, authenticated, unreachable } = input;
  return [
    {
      label: "Runtime",
      value: unreachable ? "Unavailable" : status?.financialConfigured ? "Connected" : status ? "Configuration required" : "Unknown",
      detail: unreachable ? "This browser cannot reach the local API. Start it separately with npm run runtime:dev, then refresh." : status?.financialConfigured ? "Financial API configuration is available to this browser." : status ? "The API responded, but financial services are not configured on this machine." : "Waiting for the API status response."
    },
    {
      label: "Wallet",
      value: walletAvailable ? "Connected" : "Unavailable",
      detail: walletAvailable ? "A browser wallet is available for owner sign-in." : "Install or enable the configured browser wallet to sign in."
    },
    {
      label: "Owner",
      value: authenticated ? "Authorized" : "Not connected",
      detail: authenticated ? "An owner API session is active in this browser." : "Owner sign-in is required before financial data or controls are available."
    },
    {
      label: "Agent session",
      value: status?.financialConfigured ? "Unknown" : "Unavailable",
      detail: status?.financialConfigured ? "Session authorization is verified when the runtime accepts owner actions; the API exposes no separate session-health field." : "Requires a configured financial runtime."
    },
    {
      label: "Scheduler",
      value: status?.executionEnabled === true ? "Running" : status?.executionEnabled === false && status?.financialConfigured ? "Paused" : "Unknown",
      detail: status?.executionEnabled === true ? "Local scheduling is enabled. This does not change on-chain policy or session revocation." : status?.financialConfigured ? "Local scheduling is paused. This does not change on-chain policy or session revocation." : "Scheduler state needs a configured financial runtime."
    }
  ];
}

export function coordinatorStatus(input: { available: boolean; loggedIn: boolean; ready?: boolean; sessionAuthorized?: boolean; operationStatus?: string }): StatusItem[] {
  const operation = input.operationStatus;
  const deployment = !input.available ? "Unavailable" : input.ready ? "Completed" : operation === "prepared" ? "Awaiting signature" : operation === "submitted" || operation === "submitting" ? "Pending" : operation === "unknown" ? "Unknown" : operation === "failed" ? "Failed" : "Not started";
  return [
    { label: "Coordinator", value: input.available ? "Ready" : "Unavailable", detail: input.available ? "Local onboarding coordinator responded." : "This browser cannot reach the local coordinator. Start it separately with npm run onboarding, then refresh." },
    { label: "Owner", value: input.loggedIn ? "Authorized" : "Not connected", detail: input.loggedIn ? "A local coordinator session is active." : "Connect the configured owner and review the sign-in message." },
    { label: "Deployment", value: deployment, detail: input.ready ? "Deployment and policy state are recorded by the coordinator." : "Coordinator operation status only; check the transaction before creating another operation." },
    { label: "Astra session", value: !input.available ? "Unavailable" : input.sessionAuthorized ? "Authorized" : "Not started", detail: input.sessionAuthorized ? "The coordinator recorded session authorization." : "Requires a completed deployment and the configured owner signature." }
  ];
}
