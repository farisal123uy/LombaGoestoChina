import { expect, test } from "@playwright/test";
import type { WalletOverview } from "@guardian-wallet/shared";

const id = "11111111-1111-4111-8111-111111111111", token = "ab".repeat(32);
const owner = "0x1111111111111111111111111111111111111111", account = "0x2222222222222222222222222222222222222222", hash = `0x${"ab".repeat(32)}` as const;
test("a reviewer creates and closes an isolated workspace without MetaMask or exposing a public-fork explorer link", async ({ page }) => {
  let released = false;
  await page.route("**/api/review/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let body: unknown;
    if (path === "/api/review/ready") body = { status: "ready", availableSlots: released ? 2 : 1, maxSessions: 2, dependencies: { model: "ready", fork: "ready" } };
    else if (path === "/api/review/sessions") {
      expect(request.postDataJSON().accessCode).toBe("review-code-12345678901234567890123456789");
      body = { id, token, ownerAddress: owner, accountAddress: account, expiresAt: Date.now() + 900000, mode: "isolated-local-fork" };
    } else {
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      if (path === `/api/review/sessions/${id}` && request.method() === "DELETE") { released = true; body = { status: "closed" }; }
      else if (path.endsWith("/v1/status")) body = { financialConfigured: true, providerConfigured: true, assistantConfigured: true, executionEnabled: false, ownerAddress: owner, accountAddress: account, model: { provider: "groq", modelId: "openai/gpt-oss-120b" } };
      else if (path.endsWith("/v1/tasks")) body = { tasks: [] };
      else if (path.endsWith("/v1/policy")) body = { policy: { balanceUnits: "10000000", protectedBalanceUnits: "6000000", dailyLimitUnits: "2000000", spentUnits: "0" } };
      else if (path.endsWith("/v1/risk")) {
        const overview: WalletOverview = { account, chainId: 84532, token: { address: account, symbol: "mUSD", decimals: 6, balanceUnits: "10000000", formattedBalance: "10" }, protectedBalanceUnits: "6000000", spendableBalanceUnits: "4000000", perPaymentLimitUnits: "1000000", dailyLimitUnits: "2000000", spentUnits: "0", remainingDailyUnits: "2000000", committedUnits: "0", availableToPlanUnits: "2000000", queuedTaskCount: 0, draftTaskCount: 0, schedulerPaused: true, policyVersion: "1", observedAt: 1800000000, observedBlockNumber: "100", observedBlockHash: hash };
        body = { overview, risk: { level: "low", checks: [], observedAt: overview.observedAt, scope: "wallet-policy-and-payment-operations" } };
      } else throw new Error(`Unexpected review fixture route ${path}`);
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/review");
  await page.getByLabel("Reviewer access code").fill("review-code-12345678901234567890123456789");
  await page.getByRole("button", { name: "Start private review workspace" }).click();
  await expect(page.getByText("Disposable review workspace", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect owner & sign in" })).toHaveCount(0);
  await expect(page.getByText("openai/gpt-oss-120b", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Wallet assistant" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(1);
  await expect(page.getByText(/Review sandbox: hosted AI inference/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect public transaction ↗" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close workspace" }).click();
  await expect(page.getByRole("button", { name: "Start private review workspace" })).toBeVisible();
  expect(released).toBe(true);
});

test("an unavailable reviewer runtime never pretends a session or model is ready", async ({ page }) => {
  await page.route("**/api/review/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "REVIEW_RUNTIME_UNAVAILABLE" }) }));
  await page.goto("/review");
  await expect(page.getByRole("alert").filter({ hasText: "review runtime" })).toContainText("cloud AI API configuration");
  await expect(page.getByRole("button", { name: "Start private review workspace" })).toBeDisabled();
  await expect(page.getByText("Disposable review workspace", { exact: true })).toHaveCount(0);
});

test("an access link opened after the reviewer page is loaded fills the code and removes the fragment", async ({ page }) => {
  await page.route("**/api/review/ready", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ready", availableSlots: 1, maxSessions: 1, dependencies: { model: "ready", fork: "ready" } }) }));
  await page.goto("/review");
  // This case exercises a link arriving after hydration/effect registration.
  await expect(page.getByText(/Runtime: ready.*AI model: ready/)).toBeVisible();
  const code = "synthetic-review-code-1234567890123456789";
  await page.evaluate((value) => { location.hash = `access=${value}`; }, code);
  await expect(page.getByLabel("Reviewer access code")).toHaveValue(code);
  await expect(page.getByRole("button", { name: "Start private review workspace" })).toBeEnabled();
  await expect(page).toHaveURL(/\/review$/);
});
