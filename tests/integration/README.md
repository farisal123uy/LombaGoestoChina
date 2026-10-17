# Integration acceptance plan

`payment-backend.test.ts` implements SQL-backed task/attempt, owner API, bounded
planner and worker recovery tests with PGlite and chain-driver fixtures. The actual
Kernel/EntryPoint/worker lost-response path is tested separately on a local fork in
`contracts/test/Kernel.integration.ts`. See `../../docs/ab-handoff.md` for boundaries.

Add `*.test.ts` files here when implementing the API, database, planner, and executor.
Use isolated state and local/testnet fixtures, not production credentials.

`provider.test.ts` verifies authenticated fixed-catalog signing, invoice idempotency,
payment-proof binding before provisioning, actual PGlite namespace/probe/KV,
delivery-signature verification, provider model output confinement and object-only
JSON persistence. Chain/model responses are explicit fixtures. Backend cases also
cover concurrent procurement goal conflicts and delivery retries/escalation without
repayment. The suite currently has 36 passing tests across five files.

Priority scenarios:

1. Owner authentication and cross-user access isolation.
2. Planner schema rejection before execution.
3. Task claim/idempotency under concurrent workers.
4. Unknown submission state followed by receipt reconciliation without double payment.
5. Policy changes between planning and execution.
6. Revoked permission preventing later execution.
7. Durable recovery after a worker restart.

Run with `npm run test:integration`. Other scenarios below remain acceptance targets
until corresponding cases are implemented; a selected corpus is not a security audit.
