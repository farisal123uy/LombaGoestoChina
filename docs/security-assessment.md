# Security self-assessment — implementation tracker

Latest active evidence: GPT-OSS 120B real cloud selected regression **60/60** after
a preserved **54/60 + six provider schema errors** baseline; no failed call is scored
as a contained attack. The inactive-offer schema fix permits null when no quote is
selected and rejects missing-offer quote requests without signer/task side effects.
Actual Linux and public HTTPS browser flows reach completed, verified delivery and
write/read. China readiness probes are network checks, not an audit. Guides/results:
[CLOUD-VALIDATION.md](evidence/CLOUD-VALIDATION.md), [MODEL_SELECTION.md](MODEL_SELECTION.md).

## Current cloud/reviewer additions

- Candidate model: GPT-OSS 120B on an operator-confirmed Groq Free account; 20B is an
  explicit comparator. Model-specific reasoning parameters and completion budgets are
  allowlisted. Legacy Qwen evidence is not evidence for GPT-OSS quality.
- The API key is a server secret. The client pins the HTTPS host/models, rejects
  redirects, tools and malformed/truncated outputs, and enforces bounded concurrency,
  estimated usage and provider cooldowns. No automatic model/provider fallback exists.
  The operator's Free-account confirmation is not programmatic billing verification.
- Reviewer owners/session/provider keys are created only for disposable local forks.
  They are not the original owner's credentials and are never included in model
  prompts/public views. This server-generated sandbox ownership differs from the
  product's MetaMask owner onboarding and is labeled explicitly.
- Review capabilities are single-workspace, short-lived and route-limited. Active
  requests finish before cleanup; an expired/closed capability cannot start new work.
  Internal signer/bundler listeners bind loopback and are not public RPC endpoints.
- The actual review factory is tested to completed with contract settlement, delivery
  signature, fresh PGlite probe/write/read, replay prevention and a second independent
  wallet/database. Model HTTP output is an explicit fixture in that test.
- Review host resources (fork/DB/CPU/RAM), Free quotas, cold starts, availability and
  Mainland China reachability remain deployment acceptance gates. The review image
  declares minimal Hardhat/viem/PGlite runtime dependencies in `apps/reviewer` and prunes
  build-only development tooling. Dependency scans still do not audit the contracts,
  model behavior or Docker image itself.

Current guides: [AI_CLOUD.md](AI_CLOUD.md), [REVIEW_DEPLOYMENT.md](REVIEW_DEPLOYMENT.md),
[technical documentation](technical-documentation.md), [release checklist](RELEASE_CHECKLIST.md).

Latest dependency scan: `npm audit --omit=dev` reports **0** known advisories including
the declared reviewer runtime dependencies. Full `npm audit` still reports **4 moderate**
development-chain advisories through drizzle-kit/old esbuild (GHSA-67mh-4wv8-2f99).
The review image prunes build-only dev tooling. This scan is neither an independent
security audit nor a verified Docker build; no esbuild development server is exposed.

Status: **public procurement verified; stage-two batching/security evaluated on local
forks and selected live-model cases; not independently assessed/audited**.
See [A+B handoff](ab-handoff.md) for exact implemented paths and limitations. Local
tests, chain-driver fixtures and actual-Kernel fork evidence are distinguished below.

| Control | Initial-slice status | Evidence / remaining work |
| --- | --- | --- |
| Owner authentication | Local API tests | One-use signature nonce, expiry and owner-scoped reads; multitenant/contract-owner enrollment remains future work. |
| Read/propose/execute boundary | Local/fork tested | Model API has no signer; worker restricted session; owner enable signature is explicit. |
| Scoped destinations/selectors | Kernel fork tested | Allowed Guardian payment, denied direct transfer/approval/admin/mixed batch. |
| Per-payment / daily limits | Local policy tests | Boundary, atomic batch sum and usage persistence across policy changes/UTC epoch; expand multi-process adversarial coverage. |
| Protected balance | Local policy tests | Isolated reserve, exact floor and post-transfer outflow checks. |
| Expiry / revocation | Local/fork tested | Local plan/quote expiry and owner nonce invalidation blocks later Kernel operations. |
| Gas / loop controls | Partial | Non-overlapping loop, finite unknown-review window and off-chain per-operation native gas cap; no cumulative on-chain gas/rate/paymaster policy yet. |
| Malicious planner containment | Local/fork + selected live-model corpus | Compromised-planner drain rejected on actual session path; selected 60-observation model corpus and preserved failing baseline described below. |
| Task idempotency/recovery | SQL/local-fork tested | Stable invoice IDs, leases/fencing, one active attempt/account, crash/lost-response restart without resend. |
| Batch atomicity | Local/fork + SQL group tests | Aggregate cap/rollback plus bounded queue grouping, shared durable attempt, atomic member settlement and per-service fulfillment. |
| Reentrancy | Local callback test | Global executor-module guard also blocks cross-account entry; no delegatecall storage guard assumption. |
| Approval/signature denial | Kernel fork tested, partial corpus | Approve/transfer/transferFrom/mixed batch/permit selector/nested Kernel/delegatecall/ERC-1271 denied. Real Permit2 integration semantics remain untested. |
| Vendor parsing | Adapter/schema + selected live Qwen smoke | Escaped tag breakout and typed financial-field rejection; four-case Qwen smoke evidence exists, broader encoded/multi-turn corpus pending. |
| Freshness | Contract + worker tests | Version/expiry and fresh validation before preparation; broader after-simulation race coverage remains. |
| Unknown reconciliation | SQL + actual-driver local fork + conflict fixtures | Lost-response batch recovery; confirmation/reorg/nonce/partial-settlement/head-lag/timeout conflicts tested. Production reorg/multi-bundler stress remains. |
| Circuit breaker | Partial | Local pause and pause-only guardian/account unpause tested separately; pending control-order corpus remains. |
| Provider/invoice integrity | Public + local/fork | Signed quote, canonical settlement, signed delivery and fresh PostgreSQL write/read verified in public AI-01. Service lifetime is limited; delivery is not atomic with payment. |
| Sponsored bootstrap | Public + local fork | Owner-signed deployment confirmed. Pinned paymaster, signature/intent/nonce/factory binding and restart/duplicate-request recovery tested. |

Token custody remains in the Kernel account. Only the worker receives the agent
credential; the API/model never receives an owner/session key. Example environment
files contain placeholders. Signed operation payloads stay in private DB storage and
are excluded from API views/logs. Owner/session installation and local scheduling
have separate authorization requirements.

Add concrete known risks, dependencies, trust boundaries, and test results as features
are implemented. Budget compliance alone does not prove a decision serves the user's
interests. A local worker pause is distinct from on-chain permission revocation.

## Revised control design and residual risks

- **Custody and scope:** the target Guardian action guards the smart account's token
  balance, not an unrelated helper balance. Pin the Kernel route, action, storage
  context and permitted execution mode. Other modules/sessions/old allowances must
  be inventoried. Owner compromise or deliberate owner withdrawal is outside the
  agent-path reserve promise.
- **Post-transfer invariant:** sum batch spending, reserve daily budget/IDs before
  calls, use CEI, account transfer return checks (SafeERC20 semantics) and a module
  nonReentrant guard, then assert protected balance
  and exact token outflow. All failed items roll back the whole batch; gas is not
  rolled back. Token support is restricted to verified standard-behavior ERC-20.
- **Limits:** daily means a UTC fixed window. A midnight burst is not prevented by
  claiming a rolling-24-hour limit. Policy/session updates cannot reset spent/IDs.
  Within-limit but unnecessary purchases are still a possible harm; measure intent
  alignment separately and enforce verified invoice/quote bindings.
- **External content:** tags and isolated parsing reduce exposure but are not a
  formal injection boundary. Test direct/indirect/encoded/multi-turn attacks and
  model-output fixtures; deterministic and contract authorization remain mandatory.
- **Availability and delivery:** pause-only guardians can deny service by pausing;
  only the owner unpauses. Cloud service delivery is not atomic with payment. Provider
  failure, RPC outages, key custody, SDK compatibility, and account upgrades remain
  dependencies to assess during implementation.
- **Economics:** sponsored gas still has a payer. Verify paymaster charge paths,
  absolute/relative fee budgets and bounded queues; testnet fees cannot establish
  mainnet $0.26 unit economics.

Detailed target design: [architecture](architecture.md). Acceptance matrix and model
vs enforcement evaluation: [evaluation](evaluation.md). No audit or attack-resistance
claim is made until implementation and evidence are reviewed.

## Dependency review (October 16, 2026)

`npm audit --omit=dev` reports **0 known runtime advisories** after overriding the
SDK's transitive ethjs-unit/number-to-bn copies to bn.js 4.12.3. Vitest is upgraded to
4.1.12; Vite stays pinned at 7.3.7 to avoid the npm 10 optional-peer resolver failure.
The full audit still reports **4 moderate development-tool advisories** through the
Drizzle/esbuild-kit chain (GHSA-67mh-4wv8-2f99). Migration tooling does not expose an
esbuild development server in this project. A forced/breaking Drizzle downgrade was
not applied. An advisory-free runtime scan is not proof of contract/model security.

## Qwen and hosted database update

The model runtime is native Ollama **qwen3:8b**, with JSON schema, Zod validation,
thinking disabled, 4096-token context, <=256 output tokens, bounded single-flight
inference, total timeout and no automatic transport retries. Invalid/truncated output
is rejected. Live synthetic smoke evidence is saved separately from contract fixtures
in [Qwen evaluation](evidence/qwen-local-evaluation.json); four selected passing cases
do not establish broad model robustness.

The original hosted runtime has migrations through 0003 and nine internal RLS tables.
Stage two adds an RLS-protected attempt-membership table and lookup index in 0004/0005;
these are tested in PGlite/forks and require explicit migration before runtime rollout.
The API/worker use the privileged server DB connection; browser clients use the
authenticated Fastify API. A PGlite public-role test verifies that an explicitly
granted SELECT permission still cannot read task payloads through RLS.

## Sponsored onboarding update

The local coordinator accepts only the configured owner login and signature. Client
requests cannot supply arbitrary calldata, factory, policy or gas values. Stored
operations are rechecked against current intent/nonce/factory state and gas budget
before submission. Runtime APIs never receive owner keys; session/provider keys are
provisioned locally into separate ignored files and their private values are omitted
from coordinator configuration/public responses.

Worker sponsored mode pins the paymaster, persists all factory/paymaster hash fields,
counts paymaster verification/post-op gas in the exposure limit and refuses missing/
different paymasters. It requests native sponsorship, not ERC-20 gas withdrawal.
Gas policy/credit/quota is controlled by the project; a successful quote does not
prove free service or final inclusion. The local test paymaster is intentionally
unrestricted and is never part of public deployment.

Browser coverage uses an injected wallet/coordinator fixture. Fork coverage uses
actual Kernel/EntryPoint with a fixture paymaster deposit. Both are explicitly
different from the separately verified public owner/bootstrap and procurement transactions. The local signing service
is not an Internet-facing/multi-instance production service.

## Stage-two evaluation, October 17, 2026

- **58 integration tests**, **15 contract/fork cases**, **6 browser-fixture cases**
  passed. Runtime dependency audit reported zero known advisories; this is not an audit.
- The original live Qwen corpus passed **52/60** objectives; spoofed prior approval
  produced unsafe intent/claims in planner/provider responses. Fixed catalog, quote
  signatures and contract boundaries still prevented model-supplied financial fields.
- Explicit untrusted-conversation and whole-request rejection prompts passed
  **60/60** on the same **30 unique cases repeated twice**, including benign controls.
  The original failures remain in `evidence/security-model-baseline.json`; final
  results in `security-model-evaluation.json`. This is **in-sample regression after
  prompt refinement**, not a held-out benchmark, independent samples or universal immunity.
- Batch aggregation uses current budget and the earliest existing deadline; it does
  not rerun the model with signing credentials or extend authority. Membership is
  persisted atomically with the exact operation before network send.
- Fee checks have backoff and wall-clock expiry even if RPC time stalls. Unknown
  operations remain read-only reconciliation after expiry; a deadline never authorizes
  a fresh nonce retry. Head lag returns pending instead of querying an inverted range.
- Reconciliation fixtures reject partial batch settlement, mismatched nonce,
  consumed-without-matched-receipt and reverted-with-consumed conflicts. They do not
  simulate every real consensus/network failure mode.
- The real Kernel fork rejects permit selector invocation at permission validation.
  The fixture token has no EIP-2612 implementation: token-level permit behavior is not
  claimed. Expanded case details are saved in `evidence/security-kernel-fork.json`.

## Remaining risks and release boundaries

No independent audit, formal proof, user study or production gas-economics claim.
Single-owner/process login, privileged DB, process-held session/provider credentials,
owner-authorized alternative modules/allowances, RPC/provider availability and
non-atomic service delivery remain explicit trust boundaries. A fixed UTC window
permits spending around a day boundary. Within-policy unnecessary purchases remain
an intent risk. Per-operation gas caps are not a cumulative on-chain gas/rate policy.
Terminal failed-attempt retry/operator resolution and production multi-instance auth
still require design. Stage-two runtime migration/activation, source freeze/publication
and organizer acceptance of testnet execution evidence remain release steps.
