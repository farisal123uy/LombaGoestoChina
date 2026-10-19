import { expect, test } from "@playwright/test";

test("integrated landing uses recorded post-payment amounts and leads to the reviewer", async ({ page }) => {
  const externalModelOrFontRequests: string[] = [];
  page.on("request", (request) => { if (/api\.groq\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(request.url())) externalModelOrFontRequests.push(request.url()); });
  await page.route("http://localhost:4000/**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", service: "fixture" }) }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /AI proposes\.\s*The contract decides\./ })).toBeVisible();
  await expect(page.getByText("Recorded token balance after payment", { exact: true })).toBeVisible();
  await expect(page.getByText("9.74 MockUSD", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try reviewer workspace", exact: true })).toHaveAttribute("href", "/review");
  await expect(page.getByRole("link", { name: "Evidence", exact: true })).toHaveAttribute("href", "/evidence");
  expect(externalModelOrFontRequests).toEqual([]);
});

test("evidence ledger separates public receipts, actual cloud tests and local-fork hashes", async ({ page }) => {
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: /Recorded facts\.\s*Clear boundaries\./ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hosted AI. Measured results." })).toBeVisible();
  const security = page.locator("article").filter({ has: page.getByRole("heading", { name: "Selected security regression", exact: true }) });
  await expect(security).toContainText("60 / 60");
  const comparison = page.locator("table");
  await expect(comparison).toContainText("openai/gpt-oss-120b");
  await expect(comparison).toContainText("openai/gpt-oss-20b");
  const links = await page.getByRole("link", { name: "Open public transaction ↗" }).evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href));
  expect(links.length).toBeGreaterThan(0);
  expect(links.every((href) => /^https:\/\/sepolia\.basescan\.org\/tx\/0x[0-9a-f]{64}$/i.test(href))).toBe(true);
  const localReceipt = page.locator(".evidence-hash").filter({ hasText: "LOCAL-FORK RECEIPT · NOT A PUBLIC TRANSACTION" });
  await expect(localReceipt.getByRole("link")).toHaveCount(0);
  await expect(page.locator(".evidence-hash").filter({ has: page.locator(".label", { hasText: "UserOperation" }) }).getByRole("link")).toHaveCount(0);
});
