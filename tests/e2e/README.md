# Browser acceptance plan

`owner-setup.spec.ts` covers the sponsored setup UI with explicit wallet/coordinator
fixtures. Actual signature and AA execution proof is in the sponsored Kernel fork
test. Run `npx playwright install chromium` once before `npm run test:e2e`.

Add `*.spec.ts` files here when user workflows are implemented. The Playwright
configuration starts the web application. These tests intercept API/wallet calls with
explicit fixtures; they do not need a live financial backend or owner credentials.

Cover owner connection, permission setup, starting a task, viewing confirmed results,
handling an exception, and revoking access. Assert the displayed network and evidence
match the actual operation, not just the planner's response.

`dashboard.spec.ts` covers explicit owner scheduling after quote review, displayed
transaction/delivery evidence and probe/KV actions, stable request IDs on a lost
response, and runtime-offline instructions. All wallet/API responses are fixtures.

Run with `npm run test:e2e`. **25 browser cases across four files** currently pass,
covering owner session restoration/expiry, account changes, invoice selection/cancellation,
AI quotas, escrow receipts, mobile navigation, landing/evidence and reviewer access.
`npm run typecheck` includes the browser test sources. Public procurement and
actual service evidence are recorded separately; broader adversarial/operator and
on-chain revoke UX remain acceptance targets.
