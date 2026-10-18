import { expect, test, type Page } from "@playwright/test";
import type { PaymentTask, WalletOverview } from "@guardian-wallet/shared";

const owner = "0x4217fb05408bfaBF9ed9d70f78bA13E07C94d634";
const account = "0x1111111111111111111111111111111111111111";
const hash = `0x${"ab".repeat(32)}` as const;
const taskId = "11111111-1111-4111-8111-111111111111";

// Browser/API/wallet fixtures. Real signatures, SQL and settlement are covered separately.
async function dashboard(page: Page, loseFirstResponse = false, assistant = false) {
  let running = false, startCount = 0, task: PaymentTask | undefined;
  const requests: { requestId: string; instruction: string }[] = [], values: Record<string, string> = {};
  await page.addInitScript((address) => {
    (window as unknown as { ethereum: object }).ethereum = { request: async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [address];
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "personal_sign") return `0x${"11".repeat(65)}`;
      throw new Error("Unexpected wallet method");
    }, on: () => {}, removeListener: () => {} };
  }, owner);
  await page.route("http://localhost:4000/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": request.headers().origin || "http://localhost:3000", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,PUT,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body: unknown;
    const overview: WalletOverview = { account, chainId: 84532, token: { address: account, symbol: "MockUSD", decimals: 6, balanceUnits: running ? "9740000" : "10000000", formattedBalance: running ? "9.74" : "10" }, protectedBalanceUnits: "6000000", spendableBalanceUnits: "4000000", perPaymentLimitUnits: "1000000", dailyLimitUnits: "2000000", spentUnits: running ? "260000" : "0", remainingDailyUnits: running ? "1740000" : "2000000", committedUnits: task?.status === "planned" ? "260000" : "0", availableToPlanUnits: running || task?.status === "planned" ? "1740000" : "2000000", queuedTaskCount: task?.status === "planned" ? 1 : 0, draftTaskCount: task?.status === "draft" ? 1 : 0, schedulerPaused: !running, policyVersion: "1", observedAt: 1800000000, observedBlockNumber: "100", observedBlockHash: hash };
    const risk = { level: "low", scope: "wallet-policy-and-payment-operations", observedAt: 1800000000, checks: [{ code: "POLICY_CHECKS_CLEAR", severity: "info", message: "Fixture wallet policy checks clear." }] };
    if (path === "/v1/status") body = { financialConfigured: true, providerConfigured: true, assistantConfigured: assistant, executionEnabled: running, ownerAddress: owner, accountAddress: account, model: { provider: "ollama", modelId: "qwen3:8b" } };
    else if (path === "/auth/nonce") body = { nonce: "a".repeat(48), message: "Owner API login browser fixture" };
    else if (path === "/auth/verify") body = { token: "browser-test-session" };
    else {
      expect(request.headers().authorization).toBe("Bearer browser-test-session");
      if (path === "/v1/policy") body = { policy: { balanceUnits: running ? "9740000" : "10000000", protectedBalanceUnits: "6000000", dailyLimitUnits: "2000000", spentUnits: running ? "260000" : "0" } };
      else if (path === "/v1/tasks") body = { tasks: task ? [task] : [] };
      else if (path === "/v1/risk") body = { overview, risk };
      else if (path === "/v1/assistant") {
        const input = request.postDataJSON() as { requestId: string; instruction: string };
        const base = { interpretation: "Interpretation from the browser model fixture.", origin: "live_model", modelId: "qwen3:8b", overview, risk };
        if (/swap|staking/i.test(input.instruction)) body = { ...base, intent: "unsupported" };
        else if (/database/i.test(input.instruction)) {
          task = { id: taskId, chainId: 84532, owner, paymentId: hash, instruction: input.instruction, offerId: "database-small-1h", status: "draft", createdAt: new Date().toISOString(), quote: { account, providerId: hash, invoiceId: hash, serviceHash: hash, token: account, recipient: owner, amountUnits: "260000", validUntil: 1900000000, signature: `0x${"11".repeat(65)}` } };
          body = { ...base, intent: "procure_database", task, paymentReview: { status: "ready", taskIds: [taskId], totalUnits: "260000", balanceAfterUnits: "9740000", remainingDailyAfterUnits: "1740000", blockers: [], items: [{ taskId, recipient: owner, amountUnits: "260000", invoiceId: hash }] } };
        } else body = { ...base, intent: /risk|risiko/i.test(input.instruction) ? "risk_check" : "asset_overview" };
      } else if (path === "/v1/assistant/execute") {
        expect(request.postDataJSON()).toMatchObject({ taskIds: [taskId] });
        if (task) task = { ...task, status: "planned" };
        body = { status: "queued", tasks: [task], schedulerPaused: !running };
      } else if (path === "/v1/procure") {
        requests.push(request.postDataJSON());
        task ||= { id: taskId, chainId: 84532, owner, paymentId: hash, instruction: requests[0]!.instruction, offerId: "database-small-1h", status: "planned", createdAt: new Date().toISOString(),
          quote: { account, providerId: hash, invoiceId: hash, serviceHash: hash, token: account, recipient: account, amountUnits: "260000", validUntil: 1900000000, signature: `0x${"11".repeat(65)}` },
          exchange: [{ actor: "astra", stage: "service_request", summary: "Requested the small catalog offer.", modelId: "qwen3:8b", observedAt: new Date().toISOString() }, { actor: "provider_agent", stage: "offer_response", summary: "Provider accepted 1 MB for 1 hour.", modelId: "qwen3:8b", observedAt: new Date().toISOString() }] };
        if (loseFirstResponse && requests.length === 1) return route.abort("failed");
        body = { status: task.status, task, exchange: task.exchange };
      } else if (path === "/agent/start") {
        startCount++; running = true;
        if (task) task = { ...task, status: "completed", delivery: { account, invoiceId: hash, paymentId: hash, serviceHash: hash, namespaceId: "22222222-2222-4222-8222-222222222222", transactionHash: hash, readyAt: 1800000000, expiresAt: 1900000000, signature: `0x${"11".repeat(65)}` } };
        body = { locallyPaused: false };
      } else if (path === "/agent/pause") { running = false; body = { locallyPaused: true }; }
      else if (path.endsWith("/probe")) body = { ready: true, probeCount: 2 };
      else if (path.endsWith("/database")) {
        if (request.method() === "PUT") { const input = request.postDataJSON() as { key: string; value: string }; values[input.key] = input.value; }
        body = { values };
      } else if (path === `/v1/tasks/${taskId}`) body = { task, ...(task?.delivery ? { operation: { status: "confirmed", userOperationHash: hash, transactionHash: hash } } : {}) };
      else throw new Error(`Unexpected fixture API route: ${path}`);
    }
    return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Connect owner & sign in" }).click();
  await expect(page.getByText("Owner signed in", { exact: true })).toBeVisible();
  return { requests, starts: () => startCount };
}

test("owner reviews a quote before explicit scheduling and can inspect delivered service evidence", async ({ page }) => {
  const state = await dashboard(page);
  expect(state.starts()).toBe(0);
  await page.getByRole("button", { name: "Ask Astra & request provider quote" }).click();
  await expect(page.getByText("Provider accepted 1 MB for 1 hour.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "planned", exact: true })).toBeVisible();
  expect(state.starts()).toBe(0);
  await page.getByRole("button", { name: "Start agent", exact: true }).click();
  await expect(page.getByRole("heading", { name: "completed", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect public transaction ↗" })).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${hash}`);
  await page.getByRole("button", { name: "Verify database probe" }).click();
  await expect(page.getByRole("status")).toContainText("probe verified");
  await page.getByLabel("Database key", { exact: true }).fill("project-note");
  await page.getByLabel("Value", { exact: true }).fill("Browser round-trip verified");
  await page.getByRole("button", { name: "Write & read back" }).click();
  await expect(page.locator("pre")).toContainText("Browser round-trip verified");
  await page.getByRole("button", { name: "Pause worker", exact: true }).click();
  await expect(page.getByText("Scheduler: paused", { exact: true })).toBeVisible();
  expect(state.starts()).toBe(1);
});

test("a lost procurement response reuses the same invoice request ID on retry", async ({ page }) => {
  const state = await dashboard(page, true);
  await page.getByRole("button", { name: "Ask Astra & request provider quote" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Failed to fetch" })).toBeVisible();
  await page.getByRole("button", { name: "Ask Astra & request provider quote" }).click();
  await expect(page.getByRole("heading", { name: "planned", exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(2);
  expect(state.requests[0]?.requestId).toBe(state.requests[1]?.requestId);
  expect(state.starts()).toBe(0);
});

test("an unavailable API provides the runtime startup command", async ({ page }) => {
  await page.route("http://localhost:4000/**", (route) => route.abort());
  await page.goto("/dashboard");
  await expect(page.getByRole("alert").filter({ hasText: "npm.cmd run runtime:dev" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect owner & sign in" })).toBeDisabled();
});

test("wallet assistant shows assets, obtains a draft, queues reviewed payments and follows worker confirmation", async ({ page }) => {
  const state = await dashboard(page, false, true);
  const assistant = page.getByRole("region", { name: "Wallet assistant" });
  await expect(assistant.getByText("Available for new plans", { exact: true })).toBeVisible();
  await assistant.getByLabel("Wallet instruction").fill("Rent a small database for 1 hour within my existing limits.");
  await assistant.getByRole("button", { name: "Ask wallet assistant", exact: true }).click();
  await expect(assistant.getByRole("heading", { name: "Payment preview: ready" })).toBeVisible();
  await expect(assistant.getByRole("checkbox")).toBeVisible();
  expect(state.starts()).toBe(0);
  await assistant.getByRole("button", { name: "Queue reviewed payments" }).click();
  await expect(assistant.getByRole("status")).toContainText("Scheduler is paused");
  await page.getByRole("button", { name: "Start agent", exact: true }).click();
  await expect(page.getByRole("button", { name: /database-small-1h.*completed/ })).toBeVisible();
  await assistant.getByRole("button", { name: "Check wallet risk" }).click();
  await expect(assistant.getByText("AI interpretation · qwen3:8b · risk check")).toBeVisible();
  expect(state.starts()).toBe(1);
});

test("unsupported wallet actions show capability guidance and never expose a queue action", async ({ page }) => {
  const state = await dashboard(page, false, true);
  const assistant = page.getByRole("region", { name: "Wallet assistant" });
  await assistant.getByLabel("Wallet instruction").fill("Swap half my balance into ETH and start staking.");
  await assistant.getByRole("button", { name: "Ask wallet assistant", exact: true }).click();
  await expect(assistant.getByText(/Available actions: wallet overview/)).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Queue reviewed payments" })).toHaveCount(0);
  expect(state.starts()).toBe(0);
});
