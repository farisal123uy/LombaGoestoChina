# Security self-assessment — implementation tracker

Status: **initial implementation tested locally; not independently assessed/audited**.
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
| Malicious planner containment | Local/fork fixture | Signed all-funds proposal rejected through actual session/Guardian path; live LLM jailbreak corpus still pending. |
| Task idempotency/recovery | SQL/local-fork tested | Stable invoice IDs, leases/fencing, one active attempt/account, crash/lost-response restart without resend. |
| Batch atomicity | Local policy tests | Sum eight invoices > daily cap; failed transfer rolls back prior payments/state. Queue aggregation and additional cross-UserOperation cases remain. |
| Reentrancy | Local callback test | Global executor-module guard also blocks cross-account entry; no delegatecall storage guard assumption. |
| Approval/signature denial | Kernel fork tested, partial corpus | Approve/direct transfer/mixed batch and ERC-1271 denied; dedicated permit/Permit2/nested/delegatecall corpus still to expand. |
| Vendor parsing | Adapter/schema + selected live Qwen smoke | Escaped tag breakout and typed financial-field rejection; four-case Qwen smoke evidence exists, broader encoded/multi-turn corpus pending. |
| Freshness | Contract + worker tests | Version/expiry and fresh validation before preparation; broader after-simulation race coverage remains. |
| Unknown reconciliation | SQL + actual-driver local fork | Exact signed payload/hash persisted before send; actual EntryPoint/Guardian events restore lost response; reorg/multi-bundler scenarios to expand. |
| Circuit breaker | Partial | Local pause and pause-only guardian/account unpause tested separately; pending control-order corpus remains. |
| Provider/invoice integrity | Local/fork quote checks | EIP-712 EOA signer, account/domain/invoice binding and replay IDs; actual provider fulfillment remains pending. |
| Sponsored bootstrap | Local fork + actual project quote | Exact owner hash/intent/nonce/factory/paymaster binding, finite gas exposure, durable before-send journal, restart/duplicate-request recovery; public deployment still needs owner signature. |

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

Supabase connection and both initial/RLS migrations have been applied. The seven
server-internal public-schema tables have RLS enabled without public access policies.
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
different from the pending real-owner public transaction. The local signing service
is not an Internet-facing/multi-instance production service.
