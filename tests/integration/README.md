# Integration acceptance plan

Add `*.test.ts` files here when implementing the API, database, planner, and executor.
Use isolated state and local/testnet fixtures, not production credentials.

Priority scenarios:

1. Owner authentication and cross-user access isolation.
2. Planner schema rejection before execution.
3. Task claim/idempotency under concurrent workers.
4. Unknown submission state followed by receipt reconciliation without double payment.
5. Policy changes between planning and execution.
6. Revoked permission preventing later execution.
7. Durable recovery after a worker restart.

Run with `npm run test:integration`. No cases are implemented at scaffold stage.
