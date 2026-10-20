# Bounded batching and COST-01

Stage-two implementation is integrated into `main`; original public procurement remains
the single-invoice AI-01 captured under implementation checkpoint `5088219`.

## Runtime rollout

Apply migrations **0004_batch_attempt_members.sql** and
**0005_batch_member_lookup.sql** before using this worker/database package. They
create RLS-protected membership, backfill existing attempts as single members and
index leader lookups. Original hosted DB has not been changed by stage-two testing.

Worker settings:

```dotenv
BATCH_MAX_SIZE=4
BATCH_WINDOW_MS=3000
```

Default is `BATCH_MAX_SIZE=1`, `BATCH_WINDOW_MS=0`. Size is bounded at 10, wait at
30000 ms. Restart the worker after configuration. Frontend API routes remain the
same; operation records may include `taskIds` and `leaderTaskId`, and several tasks
can legitimately share the same UserOperation/transaction hash.

Selection is deterministic over already-approved compatible plans: same owner,
account, chain, module, policy version, token and model provenance; exact original
quote fields; no repeated invoice identity. The current spendable budget is the
minimum of balance minus reserve and UTC-day allowance minus spent. The earliest
original plan/quote deadline is preserved. No TTL or permission is extended.

## Durable execution

The account lease/fence protects selection. One exact signed operation and every
unique task membership are persisted atomically before send. Root task stores the
combined durable plan. Followers retain their own invoice/plan for display and
delivery. Unresolved attempts are reconciled first, even while scheduling is paused;
confirmation/failure updates all members atomically. Paid service tasks are fulfilled
separately, each verifying its own signed receipt/probe. No delivery failure repays.

A high-fee unsigned plan enters `waiting`, retries after 10 seconds, and ends at its
wall-clock deadline even if RPC time stalls. Existing signed unknown operations are
still reconciled after expiry; there is no automatic new-nonce retry.

## Reproduce cost evaluation without real-money transactions

```sh
npm run test:cost
```

It records `docs/evidence/cost-fork.json`. The RPC URL initializes an **isolated
local fork** at Base Sepolia block 48189742. Generated owner/session/provider keys,
token funds, native prefunding and bundler are test fixtures; no public transaction
or sponsorship project quote is sent.

Each 4/7-invoice single/batch comparison uses the same already-enabled session EVM
snapshot, 10 MockUSD initial balance, reserve 6, daily cap 2, identical invoices,
fixed fees and three repetitions per mode. A valid warm-up payment occurred in the
previous UTC day, followed by a normal token transfer restoring the fixture balance
and a genuine UTC boundary; protected accounting storage is not overwritten.

**Primary metric: enclosing transaction EVM gas**, reported alongside actual
EntryPoint gas/charge, calldata sizes and local worker elapsed time. Stub estimates
use fixed verification/call/pre-verification limits, which influence unused-gas
penalties and EntryPoint charging. Those charge percentages are not an optimized
production fee estimate. OP L1-data fees, commercial bundler/paymaster pricing,
inference, hosting, electricity and actual production queue/network latency are excluded.
Savings belong to batching and apply equally to deterministic or model-approved plans.

## Security evaluation and evidence

`npm run model:security` executes 30 unique prompts twice through planner, buyer,
provider and vendor-parser roles, with synthetic quote/state and no signing tools.
Baseline 52/60 is preserved; refined prompts passed 60/60 on the same corpus.
This is in-sample regression after tuning, not a held-out/general-immunity result.

`tests/integration/reconciliation.test.ts` covers confirmation, reorg, keyed nonce,
revert/consumed conflicts, partial settlement, head lag and timeout cases with
explicit chain/RPC fixtures. The actual Kernel fork separately tests restricted
approval/permit-selector/nested/delegatecall routes and lost-response recovery.
