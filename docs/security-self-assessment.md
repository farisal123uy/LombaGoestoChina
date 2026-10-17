# Security self-assessment

International Track, Topic F. Status labels are evidence labels, not audit conclusions.

## 1. Scope and threat model

- **VERIFIED** The Guardian module mediates payment execution for a configured ERC-20 token; the committed deployment evidence identifies Base Sepolia chain ID 84532 and labels the token MockUSD. `contracts/contracts/GuardianPayments.sol:23-32`; `docs/evidence/public-deployment.json:3-29`.
- **VERIFIED** The module does not custody assets or approvals. Native gas is separate. `contracts/contracts/GuardianPayments.sol:14-16`.
- **VERIFIED** Controls cover payment amount, cumulative UTC-day spend, retained balance, recipient, signed quote, invoice replay, policy version, expiry, and pause state. `contracts/contracts/GuardianPayments.sol:141-185`.
- **VERIFIED** They do not establish safety against a compromised owner key, a malicious token implementation, infrastructure outage, a faulty Kernel implementation, or an unsafe provider service. The contract limits its own execution path; the evidence records several unestablished areas. `contracts/contracts/GuardianPayments.sol:14-16`; `docs/evidence/2026-10-16-local-fork.json:98-104`.

## 2. Permission tiers

| Tier | Authority and limit | Evidence |
| --- | --- | --- |
| Owner wallet key | **VERIFIED** The smart account installs/configures/uninstalls the module. It can pause or unpause through the account route; uninstallation disables and pauses the module. `contracts/contracts/GuardianPayments.sol:88-117`; `contracts/test/GuardianPayments.ts:90-105,127-134` | **VERIFIED** Kernel fork test creates the owner account, enables the session, revokes sessions, then observes a denied former-session operation. This test is conditional on `KERNEL_FORK_RPC_URL`; recorded local-fork evidence says one Kernel fork test passed. `contracts/test/Kernel.integration.ts:18-22,49-51,189-193`; `docs/evidence/2026-10-16-local-fork.json:93-97` |
| Agent Kernel session key | **VERIFIED** Contract documentation requires the session call policy to allow only `executePayments`; the Kernel test constructs the agent session for the Guardian and rejects direct transfer, approval, and Guardian admin calls. `contracts/contracts/GuardianPayments.sol:14-16,106`; `contracts/test/Kernel.integration.ts:49-51,85-100` | **VERIFIED** Conditional local-fork test; not a public-chain transaction. `contracts/test/Kernel.integration.ts:18-22`; `docs/evidence/2026-10-16-local-fork.json:98-103` |
| Provider signer | **VERIFIED** The signer creates EIP-712 quotes and delivery receipts, checks the registered quote signer before quoting, and requires confirmed matching settlement before provisioning. It has no contract function that transfers owner funds. `apps/api/src/provider-signer.ts:16,33-42,44-64`; `contracts/contracts/GuardianPayments.sol:136-185` | **VERIFIED** Quote recovery is bound to the policy signer in the contract. `contracts/contracts/GuardianPayments.sol:153-159` |
| Pause guardian | **VERIFIED** May set pause only; cannot unpause unless it is the account. `contracts/contracts/GuardianPayments.sol:112-117`; `contracts/test/GuardianPayments.ts:127-134` | **VERIFIED** Account-harness test. `contracts/test/GuardianPayments.ts:127-134` |
| API and worker | **VERIFIED** API authenticates one registered owner then creates/plans durable tasks; worker validates, prepares, persists, submits, and reconciles them. Neither is an on-chain owner or pause guardian. API pause only changes local worker control and explicitly reports no on-chain authority change. `apps/api/src/app.ts:66-81,174-179`; `apps/worker/src/worker.ts:39-75` | **VERIFIED** API sessions authenticate access only, not transactions or policy changes. `apps/api/src/auth.ts:8-12,24,37-46` |

## 3. On-chain controls

| Control | Enforcing code | Proving test | Conditional status |
| --- | --- | --- | --- |
| Per-invoice amount limit | **VERIFIED** Rejects zero or amount above `perPaymentLimit`. `contracts/contracts/GuardianPayments.sol:153-157` | **VERIFIED** Oversized compromised proposal and exact-boundary tests. `contracts/test/GuardianPayments.ts:71-74,107-115` | Account harness; not conditional. |
| UTC-day aggregate | **VERIFIED** Stores spend by `block.timestamp / 1 days`, rejects excess before transfers. `contracts/contracts/GuardianPayments.sol:54,164-170` | **VERIFIED** Eight-invoice aggregate and UTC rollover tests. `contracts/test/GuardianPayments.ts:75-81,161-177` | Account harness; not conditional. |
| Protected balance | **VERIFIED** Requires sufficient pre-transfer balance and verifies post-transfer floor/outflow. `contracts/contracts/GuardianPayments.sol:167-185` | **VERIFIED** Floor and adversarial-token tests. `contracts/test/GuardianPayments.ts:83-89,145-150` | Account harness; not conditional. |
| Recipient registry | **VERIFIED** Requires recipient version equal current policy version. `contracts/contracts/GuardianPayments.sol:53,123-126,155` | **VERIFIED** Wrong-recipient rejection. `contracts/test/GuardianPayments.ts:116-125` | Account harness; not conditional. |
| Invoice replay protection | **VERIFIED** Derives payment ID from chain/account/provider/invoice and consumes it before external calls. `contracts/contracts/GuardianPayments.sol:55,128-130,158-162` | **VERIFIED** Duplicate batch, policy update, and reinstall cases. `contracts/test/GuardianPayments.ts:90-105` | Account harness; not conditional. |
| Pause and session revoke | **VERIFIED** Paused policy rejects payment; pause guardian cannot unpause. `contracts/contracts/GuardianPayments.sol:112-117,141-145` | **VERIFIED** Pause test; **VERIFIED, conditional** Kernel owner-revocation test. `contracts/test/GuardianPayments.ts:127-134`; `contracts/test/Kernel.integration.ts:189-192` | Kernel test skips without `KERNEL_FORK_RPC_URL`; recorded evidence says it ran once. `contracts/test/Kernel.integration.ts:18-22`; `docs/evidence/2026-10-16-local-fork.json:93-97` |
| Signed quote binding | **VERIFIED** EIP-712 digest binds account, provider, invoice, service, token, recipient, amount, expiry; recovered signer must equal policy signer. `contracts/contracts/GuardianPayments.sol:19-21,153-157,204-205` | **VERIFIED** Forged/altered quote rejection. `contracts/test/GuardianPayments.ts:116-125` | Account harness; not conditional. |
| Batch atomicity and reentrancy | **VERIFIED** `nonReentrant`, effects before calls, default atomic single calls, transfer-result checks. `contracts/contracts/GuardianPayments.sol:88,99,106,112,136,160-185` | **VERIFIED** Transfer-failure rollback and reentrancy test. `contracts/test/GuardianPayments.ts:136-159` | Account harness; not conditional. |

## 4. Off-chain controls

- **VERIFIED** The planner accepts only `pay`, `wait`, or `needs_owner`; deterministic checks bind the quote to policy state before model output. The model never supplies recipient, amount, permission, calldata, or approval. `packages/planner/src/payments.ts:6-39`.
- **VERIFIED** Procurement binds provider ID, invoice ID, service hash, and amount to the fixed catalog before task creation. `apps/api/src/app.ts:131-149`.
- **VERIFIED** The worker writes exact prepared payload/hash before network submission, reconciles a durable attempt before any new attempt, and pauses rather than re-signing after a durable-attempt error. `apps/worker/src/worker.ts:28-37,47-75`.
- **VERIFIED** Integration tests cover invoice deduplication, persist-before-send, lost-response reconciliation without a second submit, and pause on conflicting evidence. `tests/integration/payment-backend.test.ts:81-88,103-125,184-193`.
- **VERIFIED** Owner authentication uses a registered address, single-use five-minute nonce, signature verification, hashed 15-minute bearer session, and capacity limits. `apps/api/src/auth.ts:8-46`.
- **VERIFIED** Provider agent and signer protect non-health endpoints with a timing-safe bearer-token comparison, redact authorization headers, and limit request bodies. `apps/api/src/provider-auth.ts:1-6`; `apps/api/src/provider-agent.ts:7-14`; `apps/api/src/provider-signer.ts:14-24`.
- **VERIFIED** Browser configuration example contains only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_ONBOARDING_URL`, with an explicit prohibition on private/model keys. `apps/web/.env.example:1-3`.
- **VERIFIED** API and provider processes cap request bodies at 32,768 bytes. No general per-IP rate limiter was found in the reviewed routes. `apps/api/src/app.ts:24-26`; `apps/api/src/provider-agent.ts:7-10`; `apps/api/src/provider-signer.ts:14-17`.

## 5. Adversarial cases and evidence

| Case | Tested | Evidence and origin | Not established |
| --- | --- | --- | --- |
| SEC-01: direct jailbreak / compromised planner | **VERIFIED** Local Qwen direct-jailbreak smoke case returned `needs_owner`; separate Kernel-fork fixture submitted a signed all-funds proposal and observed failed UserOperation, unchanged balance, unconsumed invoice, and zero allowance. `docs/evidence/qwen-local-evaluation.json:54-69`; `contracts/test/Kernel.integration.ts:101-107` | **VERIFIED** `qwen-local-evaluation.json` is recorded local inference with synthetic state/quote fixtures; `2026-10-16-local-fork.json` is recorded local fork and marks the planner record `adversarial_fixture`. `docs/evidence/qwen-local-evaluation.json:2-18`; `docs/evidence/2026-10-16-local-fork.json:1-8,56-61` | **VERIFIED** No live jailbreak rate, public-chain fixture transaction, or fixture proposal amount/revert decoding/before-after balances are recorded. `docs/evidence/2026-10-16-local-fork.json:98-104,56-61` |
| SEC-02: vendor text injection | **VERIFIED** Vendor parser receives escaped text as untrusted data and only emits constrained database fields; smoke fixture matched expected fields. `packages/planner/src/payments.ts:61-74`; `docs/evidence/qwen-local-evaluation.json:72-83` | **VERIFIED** Recorded local inference, no transaction. `docs/evidence/qwen-local-evaluation.json:5,92` | **VERIFIED** It is one smoke case, not attack-success measurement. `docs/evidence/qwen-local-evaluation.json:92` |
| REL-02: lost response | **VERIFIED** After intentional response loss following inclusion, restart reconciles and records one send. `contracts/test/Kernel.integration.ts:123-187` | **VERIFIED** Recorded local fork, using PGlite and a local static-gas bundler stub. `docs/evidence/2026-10-16-local-fork.json:82-91` | **VERIFIED** Not real bundler mempool, pricing, production finality, or hosted multi-process behavior. `docs/evidence/2026-10-16-local-fork.json:98-104` |

## 6. Known risks and limitations

- **VERIFIED** Qwen is local `qwen3:8b` through Ollama; recorded settings help reproduce one run but do not establish general model reproducibility. `packages/planner/src/payments.ts:43-58`; `docs/evidence/qwen-local-evaluation.json:2-13`.
- **VERIFIED** Qwen evidence covers four smoke cases, not an attack-success benchmark or prompt-injection-immunity proof. `docs/evidence/qwen-local-evaluation.json:19-92`.
- **VERIFIED** Kernel fork testing is conditional on `KERNEL_FORK_RPC_URL`; the evidence records one historical pass. The current contract-test run skipped the conditional Kernel test. `contracts/test/Kernel.integration.ts:18-22`; `docs/evidence/2026-10-16-local-fork.json:93-97`.
- **VERIFIED** Public procurement evidence declares an uncommitted working-tree source state. `docs/evidence/public-procurement.json:2-5,109-119`.
- **VERIFIED** The delivered database is an expiring one-hour provider-managed PostgreSQL JSONB namespace, not a dedicated instance. `apps/api/src/provider-signer.ts:57-64`; `docs/evidence/public-procurement.json:91-109`.
- **VERIFIED** The compromised-planner evidence omits proposed amount, decoded rejection, and fixture pre/post balances. `docs/evidence/2026-10-16-local-fork.json:56-61`.
- **CLAIMED** No third-party audit has been completed. This requires confirmation from the backend owner; the reviewed files cannot prove a negative.
- **VERIFIED** API code defaults to a localhost web origin. **CLAIMED** No public API deployment has been documented in the reviewed material; confirm with the backend owner. `apps/api/src/app.ts:24-27`; `apps/web/.env.example:1-2`.
- **VERIFIED** Current full `npm audit` reports four moderate findings: `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `drizzle-kit`, `esbuild`. The production-only audit reported none. Command run 2026-10-17.
- **CLAIMED** LGPL/MPL transitive dependency obligations require a dedicated license review; package-license metadata was not fully inventoried.
- **VERIFIED** API authentication supports one configured owner and 15-minute in-memory sessions; restart clears sessions. `apps/api/src/auth.ts:8-12,14-17,37-46`.
- **VERIFIED** On-chain session revocation is exercised through an owner wallet operation; reviewed API routes expose only local worker start/pause, not a revoke route. `contracts/test/Kernel.integration.ts:189-191`; `apps/api/src/app.ts:174-179`.
- **VERIFIED** MockUSD is labelled a test fixture / test token, not USDC or a dollar value. `docs/evidence/2026-10-16-local-fork.json:17-18`; `docs/evidence/public-procurement.json:15-17`.

## 7. Claims we do not make

- **VERIFIED** No claim of prompt-injection immunity. The evaluation explicitly disclaims it. `docs/evidence/qwen-local-evaluation.json:92`.
- **VERIFIED** The supported claim is bounded token loss when the on-chain policy, account/session restriction, and contract assumptions hold; it is not a guarantee of safe intent interpretation. `contracts/contracts/GuardianPayments.sol:141-185`; `packages/planner/src/payments.ts:31-39`.
- **VERIFIED** No claim that local-fork evidence is a public-chain transaction or that preview/evaluation evidence is payment or delivery evidence. `docs/evidence/2026-10-16-local-fork.json:7,98-104`; `docs/evidence/provider-live-preview.json:53-57`; `docs/evidence/qwen-local-evaluation.json:5,92`.

## 8. Residual risks

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Owner-key compromise | Medium | High | Hardware-backed owner key, independent recovery procedure, immediate on-chain pause/revocation. **VERIFIED** pause/revoke paths exist. `contracts/contracts/GuardianPayments.sol:112-117`; `contracts/test/Kernel.integration.ts:189-191` | Backend/owner wallet operator |
| Model follows hostile text or fails closed incorrectly | Medium | Medium | Restrict model output to decision/summary; enforce all payment fields on-chain. **VERIFIED** `packages/planner/src/payments.ts:31-39`; `contracts/contracts/GuardianPayments.sol:141-185` | Planner owner |
| Bundler/RPC ambiguity | Medium | Medium | Persist exact attempt, reconcile first, pause on conflict. **VERIFIED** `apps/worker/src/worker.ts:28-37,47-75` | Worker operator |
| Provider availability or service expiry | Medium | Medium | Verify settlement before provision; record delivery retry/escalation. **VERIFIED** `apps/api/src/provider-signer.ts:44-64`; `apps/worker/src/worker.ts:15-26` | Provider operator |
| Dependency/license exposure | Unknown | Medium | Patch advisories; complete dependency-license inventory. **CLAIMED** | Maintainer |
| Conditional fork coverage unavailable | Medium | Medium | Supply controlled RPC access and rerun Kernel suite in CI. **CLAIMED** | Backend owner |

## 9. Open questions for the backend owner

1. What reproducible CI job runs the conditional Kernel fork suite, and where is its sanitized result retained?
2. Which revision produced the uncommitted-working-tree procurement evidence, and can it be reconstructed from the listed source SHA-256 values?
3. What public API deployment, TLS, host-level rate limiting, monitoring, and incident response controls exist, if any?
4. Which upstream dependencies are LGPL/MPL, what obligations apply, and what is the remediation plan for the four moderate npm findings?
5. What operational process protects the owner key, pause guardian, provider signer, and `KERNEL_FORK_RPC_URL`?
6. What provider availability, retention, backup, deletion, and customer-data terms apply to the expiring JSONB namespace?
7. What independent contract/security review has been requested or completed?

## CLAIMED items requiring verification

1. No third-party audit has been completed.
2. No public API deployment has been documented in reviewed material.
3. LGPL/MPL transitive dependency obligations require a dedicated license review.
4. Patch advisories and complete a dependency-license inventory.
5. Supply controlled RPC access and rerun the Kernel suite in CI.
