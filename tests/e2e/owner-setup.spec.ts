import { expect, test } from "@playwright/test";

const owner = "0x4217fb05408bfaBF9ed9d70f78bA13E07C94d634";
const state = {
  chainId: 84532, owner, kernel: "0x1111111111111111111111111111111111111111", guardian: "0x2222222222222222222222222222222222222222",
  token: "0x3333333333333333333333333333333333333333", providerSigner: "0x4444444444444444444444444444444444444444", recipient: "0x4444444444444444444444444444444444444444",
  sessionSigner: "0x5555555555555555555555555555555555555555", paymaster: "0x777777777777AeC03fd955926DbF81597e66834C", validUntil: 1900000000,
  installed: false, ready: false, sessionAuthorized: false, runtimeConfigured: false, gasMode: "sponsored_native_gas",
  limits: { initialTokenUnits: "10000000", protectedUnits: "6000000", perPaymentUnits: "1000000", dailyUnits: "2000000", decimals: 6 },
};

// Browser wallet/coordinator fixtures only; actual signature/AA paths are tested on the fork.
test("owner completes the visible sign/deploy/session flow without entering a private key", async ({ page }) => {
  const current: typeof state & { operation?: { id: string; hash: string; status: string; preparedAt: number; maxGasCostEth: string; transactionHash?: string } } = structuredClone(state);
  await page.addInitScript(({ address }) => {
    (window as unknown as { ethereum: object }).ethereum = {
      request: async ({ method }: { method: string }) => {
        if (["eth_requestAccounts", "eth_accounts"].includes(method)) return [address];
        if (["wallet_switchEthereumChain", "wallet_addEthereumChain"].includes(method)) return null;
        if (["personal_sign", "eth_signTypedData_v4"].includes(method)) return `0x${"11".repeat(65)}`;
        throw new Error("Unexpected test wallet method");
      },
      on: () => {}, removeListener: () => {},
    };
  }, { address: owner });
  await page.route("http://127.0.0.1:4100/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body: unknown = current;
    if (path === "/auth/nonce") body = { nonce: "test-nonce", message: "Owner sign-in test fixture" };
    if (path === "/auth/verify") body = { token: "owner-browser-test-token" };
    if (path === "/prepare") current.operation = { id: "11111111-1111-4111-8111-111111111111", hash: `0x${"aa".repeat(32)}`, status: "prepared", preparedAt: Date.now(), maxGasCostEth: "0.0001" };
    if (path === "/submit") { current.operation!.status = "submitted"; }
    if (path === "/reconcile") { current.operation!.status = "confirmed"; current.operation!.transactionHash = `0x${"bb".repeat(32)}`; current.installed = true; current.ready = true; }
    if (path === "/session/authorization") body = { typedData: { domain: { name: "Kernel", version: "0.3.1", chainId: 84532, verifyingContract: current.kernel }, primaryType: "Enable", types: { Enable: [{ name: "nonce", type: "uint32" }] }, message: { nonce: 1 } } };
    if (path === "/session/approve") { current.sessionAuthorized = true; current.runtimeConfigured = true; }
    await route.fulfill({ contentType: "application/json", headers, body: JSON.stringify(body) });
  });
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Connect owner" })).toBeVisible();
  await page.getByRole("button", { name: "Connect MetaMask & sign in" }).click();
  await expect(page.getByText("Owner connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prepare deployment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign & submit deployment" })).toBeEnabled();
  await page.getByRole("button", { name: "Sign & submit deployment" }).click();
  await expect(page.getByRole("button", { name: "Authorize Astra session" })).toBeEnabled({ timeout: 15000 });
  await expect(page.getByRole("link", { name: /View transaction/ })).toHaveAttribute("href", `https://sepolia.basescan.org/tx/0x${"bb".repeat(32)}`);
  await page.getByRole("button", { name: "Authorize Astra session" }).click();
  await expect(page.getByText("Runtime configuration ready.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("coordinator outage gives a usable startup instruction", async ({ page }) => {
  await page.route("http://127.0.0.1:4100/**", (route) => route.abort());
  await page.goto("/setup");
  await expect(page.getByRole("alert").filter({ hasText: "npm.cmd run onboarding" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect MetaMask & sign in" })).toBeDisabled();
});

test("a different wallet cannot proceed to owner sign-in or deployment", async ({ page }) => {
  let nonceRequests = 0;
  await page.addInitScript(() => {
    (window as unknown as { ethereum: object }).ethereum = { request: async () => ["0x9999999999999999999999999999999999999999"], on: () => {}, removeListener: () => {} };
  });
  await page.route("http://127.0.0.1:4100/**", (route) => {
    if (new URL(route.request().url()).pathname === "/auth/nonce") nonceRequests++;
    return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "http://localhost:3000" }, body: JSON.stringify(state) });
  });
  await page.goto("/setup");
  await page.getByRole("button", { name: "Connect MetaMask & sign in" }).click();
  await expect(page.getByText(`Select the configured owner: ${owner}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare deployment", exact: true })).toBeDisabled();
  expect(nonceRequests).toBe(0);
});
