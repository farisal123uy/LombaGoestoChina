# Architecture

Revision: October 16, 2026. The A+B initial slice is implemented; the detailed sections
below also contain future design targets. [A+B handoff](ab-handoff.md) is the current
implementation/limitation reference. [Workflow](workflow.md) defines integration gates;
[demo script](demo-script.md) defines the enterprise AI-to-AI scenario.

## Foundation and implemented A+B additions

Sponsored onboarding extends this slice: the local coordinator verifies browser
owner signatures for a static CREATE2/bootstrap intent and a scoped Kernel session,
persists signed payloads before submission, and synchronizes verified deployment
settings. Owner keys stay in MetaMask. Native paymaster fields are persisted exactly
and checked against an explicit paymaster allowlist; no native fallback is automatic.
See [Sponsored Setup](SPONSORED_SETUP.md) for local-only operational boundaries.

- `apps/web`: English-language project landing page and manual API health check.
- `apps/api`: process health and explicit pending-capability status.
- `apps/worker`: bounded heartbeat interval, execution disabled.
- `packages/shared`: draft interfaces and task statuses.
- `packages/planner`: bounded decision planner, native Ollama/Qwen client and isolated parser.
- `packages/wallet`: development public client and executor interface.
- `packages/database`: draft Drizzle schema and connection factory.
- `contracts`: local/testnet MockUSD and an Ignition deployment module.
- Guardian is now an ERC-7579 **executor module**, with account-bound policy/accounting
  storage in the module and token transfers performed by Kernel executeFromExecutor.
  A global module reentrancy guard also blocks cross-account reentry. This replaces
  the earlier tentative delegatecall-action integration design below.
- SQL tasks/attempts/locks/worker controls, owner auth/task/planning API, bounded model
  adapter and isolated parser, exact-operation persistence and reconciliation worker.
- Actual Kernel 0.3.1/EntryPoint 0.7 local-fork integration includes a real worker
  lost-response recovery using PGlite and a static-gas local bundler stub. Unit
  harness, chain-fixture backend tests and fork evidence have distinct labels.

## Intended execution path

```text
Owner wallet -> authorize registry / policy / session on-chain
Task -> Astra planner <-> Provider agent / untrusted description
              |
       Verified quote + structured plan -> PostgreSQL
              |
       Schema / authority / freshness / fee gates
         | reject / replan / wait / ready
                                     |
                           Claim + simulate + persist attempt
                                     |
                           Restricted executor signer
                                     |
                     Bundler -> EntryPoint -> Kernel
                                               |
                                    Guardian executePayments
                                      | revert / settled
                                      v
                          Receipt + payment event reconciliation
                                      |
                       Provider acknowledgement + service probe
                                      |
                          completed / service_pending
```

The initial single-invoice financial path is wired; provider fulfillment, scheduler
batch aggregation and production deployment still require work. The planner proposes structured data;
deterministic code resolves trusted recipients, amounts, and current policy. The
executor holds only delegated signing authority. Owner-level policy changes require
the owner's wallet authorization.

Use string-encoded integer token units in JSON. Keep UserOperation hashes, transaction
hashes, receipts, and business task completion as distinct facts.

## Integration/deployment work still to prove beyond the initial local slice

- Public-network deployment compatibility, real bundler/gas pricing and evidence.
- Hosted PostgreSQL/pooler and multi-process recovery behavior; multi-instance auth.
- Cumulative gas budgets, sponsorship, queue batching and cost evaluation.
- Broader Qwen/provider/human evaluations beyond the recorded local four-case smoke run.

## Authority and custody

The owner authorizes policy and session changes using their wallet. Astra only
reads/proposes; its runtime and the quarantined vendor parser never hold signing
keys. The executor holds restricted session authority, not the owner key. Chat
claims of ownership, including direct user jailbreaks, cannot modify this authority.
"Air-Gapped" is a working product phrase: the technical boundary is authority
separation, not physical network isolation.

Target: a `GuardianPayments.executePayments` action on one permitted Kernel route.
The protected token is held by the smart account, and the guard must read/transfer
that account's balance. Prove action execution context, per-account isolated storage,
caller authorization, and compatible hooks against the pinned Kernel version before
claiming integration. If its adapter uses delegatecall, restrict it to the reviewed,
pinned action; this does not grant arbitrary delegatecall to the agent.

The agent cannot access raw token transfers, unrelated generic execute/batch paths,
nested multicalls, allowance/permit/signature authorization, account/module upgrades,
or policy administration. Inventory other installed sessions/modules and pre-existing
allowances. The protected-balance promise covers enabled agent paths; the owner can
still use owner authority to withdraw or change policy.

## Atomic execution invariants

For one supported, standard-behavior ERC-20 token, define `total = sum(amounts)` and
`epoch = floor(block.timestamp / 1 days)` (UTC fixed window, not rolling 24 hours).
Track `spent[account][token][epoch]` across policy/session changes and operations.

1. Enter an account-scoped reentrancy guard; check authorized route, active session,
   pause state, expected policy version and execution deadline.
2. Validate nonempty batch size <= 10, per-invoice positive amount <= limit, approved
   recipients, verified quote/invoice bindings and supported token. Reject consumed
   payment IDs and duplicate IDs within the same batch.
3. Use checked integer sums and require `spent + total <= dailyLimit` and
   `balanceBefore >= protectedBalance + total`.
4. Update spending and mark all IDs consumed **before** external calls (CEI). Transfer
   using SafeERC20 in the account's execution context. Any failed item reverts the
   entire application batch; do not catch failures and allow partial settlement.
5. Read the account balance after transfers. Require `balanceAfter >= protectedBalance`
   and exact outflow `balanceBefore - balanceAfter == total`. Emit per-invoice events.

The guard covers every entrypoint sharing this state. Token fee/rebase/callback
semantics are outside the supported asset set, but adversarial callback tokens remain
useful test fixtures. A reverted action rolls back token/state changes, not spent gas.
Execution-time checks protect against races across separate UserOperations even when
their earlier simulations saw identical state. They belong in the execution action,
not arbitrary stateful checks added to `validateUserOp` against ERC-4337 rules.

Push-payment only: deny `approve`, allowance increases, permit/Permit2, arbitrary
signatures including EIP-1271 paths that grant spend authority, and generic routes
that can create them. Use a fresh zero-allowance account or owner-revoke existing
allowances before activation. A spender with an old allowance can drain externally;
blocking future approvals alone is insufficient. Native/sponsored gas is separate;
the MVP paymaster must not debit the protected token outside the action.

## Provider exchange and injection containment

A quote binds request/service specification, provider, invoice, recipient registry,
chain/token, integer price and expiry with provenance verified deterministically.
Target provenance is a registered provider signer's EIP-712 quote, domain-separated
by chain/action and bound to the paying account, invoice, request/service hash, token,
recipient, amount and deadline. Backend and action verify signature/bindings; the
provider signer is outside the provider model runtime. The hostile high-value quote
in SEC-01 is signed by the fixture provider to isolate limit enforcement.
Invoice identity is stable across retries/replanning/policy updates, scoped to chain,
account and provider. A schema-valid model plan cannot replace verified quote fields.

Keep system instructions and trusted policy separate from vendor content. For free
text, a quarantined parser with no tools extracts only bounded enum/typed fields
(`serviceType`, `capacity`, `duration`). Astra sees those untrusted fields and verified
quote fields, not the raw vendor description. Escape XML delimiters when wrapping
`<untrusted_vendor_description>` content, enforce length/field limits, and test closing
tags, role spoofing, hidden HTML, encoded and multi-turn payloads. XML and Dual-LLM
are mitigations, not authorization or a proof of injection immunity. Executor/contract
controls still operate if either model produces a hostile plan.

Paying a provider does not atomically guarantee service delivery. Acknowledgement and
an actual service probe determine `completed`; otherwise retain `service_pending`
and reconcile provisioning without paying the invoice again. Label simulated provider
AI and mock provisioning explicitly.

## Freshness, batching and controls

Plans bind observed block/hash/time, quote hash, policy version, payment IDs and TTL.
After inference and before signing, reread balance/spent, policy/session/pause state,
invoice settlement, expiry and account nonce. Invalidated plans replan or wait; do not
silently change quoted invoice amounts. Simulate the final payload. Execution checks
version/TTL/invariants again because simulation cannot lock future chain state.

Scheduler batches only compatible account/chain/token invoices, bounded to 10 items,
using a configurable initial queue wait of 30 seconds and earlier quote deadlines.
Check absolute and relative fee budgets; `waiting_fee` ends at deadline with owner
review/cancellation. Record execution/validation and L1 data fees where applicable,
bundler/paymaster surcharges, failed attempts, model cost and queue latency. Bundler
aggregation of UserOperations is distinct from this atomic payment batch. Sponsored
gas remains an economic cost; measure rather than assume batching savings.

Worker local pause (initial fixture threshold: 3 consecutive security anomalies),
contract pause and Kernel session revocation are distinct. A separately authorized
pause-only guardian or owner can pause the contract; only the owner can unpause or
expand authority. Local pause stops new sends, not pending chain operations. On-chain
pause/revocation take effect in execution order; continue read-only reconciliation.

## Unknown-state reconciliation

The task and operation state machines must be separated; the draft schema currently
reuses one enum. Use unique logical payment IDs, transactional claims/leases with
fencing, and one in-flight operation per account for the MVP. Persist signed payload
securely and metadata (expected userOpHash, chain/EntryPoint, sender, nonce key/sequence,
submission block/time, expiry, replacement family, batch items) **before** sending.
Do not put private keys in records or logs.

On timeout/restart:

1. Freeze resending and acquire a reconciliation lease. A missing response can occur
   after bundler acceptance; unknown is not a proof of non-submission.
2. Query `eth_getUserOperationReceipt` / `eth_getUserOperationByHash` using the hash
   derived with the pinned SDK/EntryPoint. Match EntryPoint and Guardian settlement
   events from the submission block and inspect UserOperation success separately from
   the outer transaction status.
3. Check `EntryPoint.getNonce(account, nonceKey)`, not the EOA transaction nonce. A
   higher sequence alone is not proof of payment; match hash, events and consumed IDs.
4. Successful inclusion waits for the chosen chain confirmation threshold and service
   acknowledgement. Included revert needs proof of no settlement/consumed IDs before
   an eligible new attempt. Reorged inclusion returns to reconciliation.
5. Poll with bounded exponential backoff/jitter (initial 2/4/8/16 seconds, cap 30 seconds,
   five-minute active window). Unresolved results become `needs_review` and local
   pause; read-only reconciliation can continue. A missing RPC result is not a drop.
6. Rebroadcast only the identical signed payload when appropriate. Fee replacement
   preserves nonce key/sequence and business intent in one attempt family; persist
   and resign changed hashes. Do not create a new-nonce payment on timeout.
7. A new attempt needs evidence the old operation failed or cannot execute (e.g. its
   enforced deadline passed or its nonce was consumed and reconciled), fresh state,
   and the **same logical payment IDs**. On-chain consumed IDs are the final duplicate
   settlement guard if attempts race. Conflicting evidence stays `needs_review`.

See [evaluation](evaluation.md) for required cases and [execution evidence](execution-evidence.md)
for artifact fields. None of these checks has passed merely by being documented.
