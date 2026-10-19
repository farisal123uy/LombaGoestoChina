# Execution evidence

Public Base Sepolia deployment is confirmed in
[`evidence/public-deployment.json`](evidence/public-deployment.json). The owner-signed
sponsored bootstrap succeeded, installed policy and funded 10 MockUSD in Kernel.
The first public procurement/payment/service outcome is now verified separately in
[`evidence/public-procurement.json`](evidence/public-procurement.json) and the
[AI-01 report](evidence/AI-01-public-procurement.md): 0.26 MockUSD settled, signed
delivery and actual hosted PostgreSQL probe/unique-value write-read passed. Local
contract and actual-Kernel fork payments/rejections have also been tested.
The [A+B handoff](ab-handoff.md) contains reproduction commands and setup boundaries.
The captured [local-fork manifest](evidence/2026-10-16-local-fork.json) records the
observed hashes/outcomes with explicit source-state and simulation labels. It is
not an explorer manifest for public Base Sepolia transactions.

## Initial implementation evidence

- Stage-two local evaluation: [COST-01 report](evidence/COST-01-local-batching.md),
  [selected model/security summary](evidence/security-evaluation-summary.md) and
  [actual Kernel expanded fixtures](evidence/security-kernel-fork.json).
  These submit no public transactions; source hashes identify the working snapshot.
- English submission review assets: [guide](../submission/README.md), 9-slide PPTX/PDF,
  technical/risk PDFs, 4m24s narrated evidence walkthrough and source/evidence archive.
  Official team details, release publication and portal receipt are not fabricated.
- [Live provider preview](evidence/provider-live-preview.json): real local Qwen buyer
  intent, separate provider agent/signer, hosted invoice persistence, verified quote
  signature and live payment planning against public policy. Worker idle and auth
  boundaries verified; selected wait/jailbreak cases passed. No payment task,
  UserOperation or service provisioning was created. Buyer inference ran in the CLI
  using API planner code; actual owner API login remains required for procurement.
- `tests/integration/provider.test.ts`: PGlite service provisioning/KV/probe with
  explicit chain/model fixtures, quote/receipt signing, fixed-offer boundaries and
  JSON object constraints. Worker cases test delivery retry/escalation without repay.
- `tests/e2e/dashboard.spec.ts`: explicit scheduling, quote/evidence display, lost
  response request-ID reuse and service actions with browser/API fixtures.
- [Actual project bootstrap quote](evidence/sponsored-bootstrap-quote.json): full
  contract deployment/install simulation quote with no owner signature or public
   transaction. This earlier quote is separate from the subsequent public manifest.
- `SponsoredBootstrap.integration.ts`: owner bootstrap, exact-signature validation,
  origin/auth rejection, duplicate/unknown recovery, scoped sponsored payment and
  persistent owner/Kernel native balance zero on the local fork. This uses a fixture
  paymaster, not the production ZeroDev policy engine.
- `tests/e2e/owner-setup.spec.ts`: visible browser flow, wrong wallet refusal and
  offline startup guidance with injected wallet/coordinator fixtures.

- [Qwen live local smoke evidence](evidence/qwen-local-evaluation.json): actual
  qwen3:8b/Ollama inference with synthetic state and quote fixtures, recorded separately
  from blockchain execution. Supabase connection, schema migration and RLS status
  have been verified; hosted multi-process stress remains a separate evaluation.

- `contracts/test/GuardianPayments.ts`: local account-harness policy/invariant suite.
- `tests/integration/payment-backend.test.ts`: PostgreSQL-engine (PGlite) SQL/auth/
  planner/worker integration, with explicitly injected chain-driver fixtures.
- `contracts/test/Kernel.integration.ts`: actual Kernel 0.3.1 and EntryPoint 0.7 on
  a local Base Sepolia fork at block 48189742. It tests allowed payment, denied token/
  admin/batch/signature bypass, hostile planner fixture, owner revoke, and the actual
  SDK execution driver's lost-response recovery with SQL state and no second send.
- Fork worker recovery uses PGlite and a local stub bundler with static gas estimates;
  it is not evidence of real bundler mempool behavior, hosted DB performance or gas
  economics. All hashes emitted by this test belong to its ephemeral local fork.

For each actual demonstration, record:

- Source revision and deployment version.
- Task ID, intended outcome, initial state, and policy version.
- Chain ID, account, token address/decimals, recipient, and integer amount.
- UserOperation hash, final transaction hash, and explorer URL.
- Receipt status and a separate explanation of task completion.
- Rejected request, relevant policy, and error/trace when no transaction is included.
- Case ID (AI/SEC/REL/COST), actual model ID/config, input source and output origin
  (`live_model` or `adversarial_fixture`); live vs recorded replay.
- Verified provider quote/invoice, stable payment ID, quote hash/expiry and service
  acknowledgement/probe. Label fixture provider AI and mock provisioning.
- Observed block/hash/time, current policy/session/pause, pre/post token balance,
  daily-spending counter, consumed payment IDs and allowance where relevant.
- Prepared attempt ID/family, keyed nonce and sequence, expected UserOperation hash
  derived before send, submission block/time, replacement links and reconciliation
  timeline; never export keys or reusable signed payloads in public evidence.
- Batch membership/total, atomicity outcome, actual UserOperation success and payment
  events distinct from the enclosing transaction's receipt status.
- Single/batch fees, execution/validation/L1-data components where applicable,
  surcharge, payer/sponsor, model cost, failed attempts, queue latency and any USD
  conversion assumptions. Include chosen chain confirmation threshold/reorg handling.

A failed pre-submission check may have no on-chain transaction hash. A model response,
an HTTP success code, or a submission hash is not a confirmed payment.

Base Sepolia is the development network. Confirm the accepted evidence network with
the organizing committee and label test tokens clearly.

## Final-demo evidence bundles (local coverage does not complete submission)

| Bundle | Coverage and outstanding evidence |
| --- | --- |
| AI-01 | Public 0.26 settlement + signed delivery + fresh PostgreSQL probe/write-read verified; saved JSON/report linked above. |
| SEC-01 | Hostile-plan contract fixture verified locally/fork; actual dashboard/live-model jailbreak remains. |
| SEC-02 | Vendor injection corpus, parser/planner outputs, decisions and benign-case controls. |
| SEC-03–07 | Initial local/fork policy coverage above; expand corpus/control ordering and collect accepted public-network evidence. |
| REL-01–03 | Local/fork crash, lost-response, stale preflight, rollback and fixture delivery retries covered; reorg/hosted service-failure evaluation remain. |
| COST-01 | Actual Kernel/worker 4/7 comparison, three repeats/mode, identical warm snapshots; EVM gas scope and stub/L1/pricing exclusions recorded. |

For SEC-01, distinguish local EVM execution, public-chain simulation, bundler rejection
and mined revert. Only the first three may be available for a rejected operation;
none implies a mined failure. Preserve the real authorization path in contract tests.
The [demo script](demo-script.md) must refer to actual saved results before recording.
