import { expect, test } from "@playwright/test";

test("integrated landing uses recorded post-payment amounts and leads to the reviewer", async ({ page }) => {
  const externalModelOrFontRequests: string[] = [];
  page.on("request", (request) => { if (/api\.groq\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(request.url())) externalModelOrFontRequests.push(request.url()); });
  await page.route("http://localhost:4000/**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", service: "fixture" }) }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /AI proposes\.\s*The contract decides\./ })).toBeVisible();
  await expect(page.getByText("Recorded token balance after payment", { exact: true })).toBeVisible();
  await expect(page.getByText("9.74 MockUSD", { exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link", { name: "Setup" })).toHaveAttribute("href", "/setup");
  await expect(navigation.getByRole("link", { name: "Wallet" })).toHaveAttribute("href", "/dashboard");
  await expect(navigation.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/review");
  await expect(page.getByRole("link", { name: "Try the reviewer workspace", exact: true })).toHaveAttribute("href", "/review");
  await navigation.getByRole("link", { name: "Evidence" }).click();
  await expect(page).toHaveURL(/\/evidence$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Evidence" })).toHaveAttribute("aria-current", "page");
  expect(externalModelOrFontRequests).toEqual([]);
});

test("evidence ledger separates public receipts, actual cloud tests and local-fork hashes", async ({ page }) => {
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: /Recorded facts\.\s*Clear boundaries\./ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hosted AI. Measured results." })).toBeVisible();
  const escrow = page.locator("#escrow-demo");
  await expect(escrow.getByRole("heading", { name: "Escrow lock, provider release and service delivery" })).toBeVisible();
  await expect(escrow).toContainText("Guardian accepted provider attestation");
  const escrowExplorerLinks = await escrow.getByRole("link", { name: "Open public transaction ↗" }).evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href));
  expect(escrowExplorerLinks).toHaveLength(2);
  expect(escrowExplorerLinks.every((href) => /^https:\/\/base-sepolia\.blockscout\.com\/tx\/0x[0-9a-f]{64}$/i.test(href))).toBe(true);
  const security = page.locator("article").filter({ has: page.getByRole("heading", { name: "Selected security regression", exact: true }) });
  await expect(security).toContainText("60 / 60");
  const comparison = page.locator("table");
  await expect(comparison).toContainText("openai/gpt-oss-120b");
  await expect(comparison).toContainText("openai/gpt-oss-20b");
  const links = await page.getByRole("link", { name: "Open public transaction ↗" }).evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href));
  expect(links.length).toBeGreaterThan(0);
  expect(links.every((href) => /^https:\/\/base-sepolia\.blockscout\.com\/tx\/0x[0-9a-f]{64}$/i.test(href))).toBe(true);
  const localReceipt = page.locator(".evidence-hash").filter({ hasText: "LOCAL-FORK RECEIPT · NOT A PUBLIC TRANSACTION" });
  await expect(localReceipt.getByRole("link")).toHaveCount(0);
  await expect(page.locator(".evidence-hash").filter({ has: page.locator(".label", { hasText: "UserOperation" }) }).getByRole("link")).toHaveCount(0);
});

test("shared navigation remains usable on mobile across setup, wallet and evidence", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("http://127.0.0.1:4100/**", (route) => route.abort());
  await page.route("http://localhost:4000/**", (route) => route.abort());
  await page.goto("/");
  for (const [label, path] of [["Setup", "/setup"], ["Wallet", "/dashboard"], ["Evidence", "/evidence"]]) {
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    await navigation.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
