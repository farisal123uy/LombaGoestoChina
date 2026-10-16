# Browser acceptance plan

Add `*.spec.ts` files here when user workflows are implemented. The Playwright
configuration starts the web application; start the required backend fixtures
explicitly for financial scenarios.

Cover owner connection, permission setup, starting a task, viewing confirmed results,
handling an exception, and revoking access. Assert the displayed network and evidence
match the actual operation, not just the planner's response.

Run with `npm run test:e2e`. No cases are implemented at scaffold stage.
