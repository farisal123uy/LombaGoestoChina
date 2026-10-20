# Security Self-Assessment — Guardian Wallet: Astra

- **Assessment type:** internal project self-assessment, not a third-party audit.
- **Last aligned:** October 20, 2026, against the `main` integration and current team-supplied materials.
- **Verified runtime baseline:** `d5517adc9d551ba6df36b53a357001bb35edd981`. The [submission index](README.md) identifies the deployed build, selected UI, materials and exact-revision procedure.
- **Scope:** owner/session authorization, model/API boundaries, GuardianPayments, durable execution, provider fulfillment and reviewer isolation.

## 1. Executive assessment

Guardian Wallet separates AI interpretation from financial authorization. Models return
bounded decisions; the financial API verifies invoices and manages tasks; the worker holds
a restricted Kernel session; Guardian enforces the configured payment policy during execution.
The owner retains root authority and signs deployment/delegation separately from API login.

Evidence includes public Base Sepolia direct and escrow procurement records, actual
Kernel/EntryPoint fork tests, SQL/process-restart recovery, browser fixtures and selected
live GPT-OSS regression. The October 20 local checkpoint records **156 passing tests**.
Latest full and production dependency scans report **0 known advisories** after the scoped
esbuild update. Neither result establishes independent security assurance.

No independent audit, formal verification, held-out red-team benchmark, mainnet financial
acceptance, production-scale multi-tenant validation or uptime guarantee is claimed.

## 2. Assets and trust boundaries

Protected assets include owner authority, policy/recipient configuration, token reserve and
daily accounting, permanent invoice IDs, session/provider credentials, model/DB credentials,
exact signed payloads and the integrity/isolation of task and reviewer state.

| Boundary | Security interpretation |
| --- | --- |
| Owner wallet ↔ application | Login proves control of the configured EOA; it does not install policy, renew sessions or approve arbitrary transactions. |
| Browser ↔ API | The browser receives short-lived bearer/capability tokens, not server signing keys or privileged DB credentials. |
| Model ↔ deterministic code | Structured output is untrusted data. Schema compliance is not authorization or proof of intent alignment. |
| API ↔ provider | Quote/delivery signatures bind a configured signer. A valid signature does not establish provider independence or service quality. |
| Database ↔ worker | Privileged server DB access and durable journal integrity remain trusted operational dependencies. |
| Worker ↔ RPC/bundler/chain | Responses can be missing, delayed or conflicting; submission success is not canonical settlement. |
| Restricted route ↔ owner/other authority | Owner actions, other modules/sessions and old allowances can be outside the agent-path reserve guarantee. |
| Reviewer ↔ workspace/host | Capabilities isolate disposable fork resources; host compromise, capacity, model quota and fork-source availability remain external dependencies. |

## 3. Permission tiers

| Tier | Principal | Implemented authority and limits |
| --- | --- | --- |
| 0 — Owner/root | Owner EOA through its wallet/account route | Authorize deployment/session, configure policy/recipients, unpause and revoke non-root sessions. Owner authority can withdraw funds or authorize other modules; the owner key stays in the wallet. |
| 1 — Model | GPT-OSS through the structured client | Intent, offer/decision and summary only; no signer tools, raw calldata or authority to replace authenticated amount/recipient. |
| 2 — Authenticated financial API | Fastify owner bearer session | Read state, validate quotes, plan/manage tasks and release reviewed selections. Holds no owner/session signing key. |
| 3 — Restricted worker | Kernel session signer | Guardian target/selector allowlist, CALL type, zero native call value and timestamp policy. Arbitrary token approvals/transfers, administration and Kernel ERC-1271 authority are excluded. |
| 4 — Guardian executor | Separate ERC-7579 contract installed on Kernel | Per-account policy/accounting; direct/lock quote, cap, reserve, recipient, expiry and replay enforcement. Release/refund separately check escrow state and attestation/deadline. |
| 5 — Provider agent and signer | Separate model and signing/service processes | Agent assesses catalog offers without a key. Signer issues fixed quotes/attestations and manages namespaces without owner/session authority. |
| 6 — Reviewer capability | Short-lived workspace access token | Allowed routes for one disposable wallet/DB/fork, bounded lifetime/rate/capacity; no owner/admin or arbitrary public RPC access. |

The default session permits `executePayments`. Escrow permission explicitly adds
`lockPayment`, `releaseEscrow` and `refundEscrow`, while still including `executePayments`;
the escrow worker selects a single-invoice lock. Permission changes require owner authorization.
Zero native call value is distinct from gas expenditure.

## 4. Implemented controls

### Authentication, sessions and secrets

- Custom EIP-191 login challenge binds domain, chain, address and a one-use nonce. Challenges
  expire after five minutes; server-instance bearer sessions after fifteen minutes.
- Setup/coordinator and financial API sessions are separate. Tab-local restoration validates
  MetaMask account, Base Sepolia, expiry and `/auth/session`. Relevant 401 responses and wallet
  changes invalidate login. Server restart invalidates in-memory sessions.
- Account/owner filtering restricts list/detail/assistant selections to the active configured
  account. Existing operations cannot be removed by cancelling/replanning an unpaid task.
- Local onboarding recomputes fixed intent/permission data and verifies owner signatures,
  nonce/factory state, paymaster and gas bounds. It provisions restricted/provider credentials
  into separate ignored files; it does not obtain an owner private key.
- The financial API/model processes do not hold the worker key. Reviewer-generated root/session
  keys belong only to disposable forks and are separate from the public owner's credentials.
- Browser storage is not a secret vault: same-origin script compromise remains a token risk.
  Private payload journals, credential URLs and signing keys are not public API/evidence fields.

### Model, request and invoice integrity

- The selected client pins reviewed HTTPS host/models, rejects credential-bearing redirects,
  malformed/truncated output and unsupported response structures, and applies schema validation,
  bounded concurrency/input/completion/timeouts and quota/cooldown controls.
- No automatic model/provider fallback is used. Free-account confirmation is operator-supplied;
  it does not programmatically inspect billing tier. In-memory budgets are process-local;
  actual account-wide limits remain provider-enforced.
- Code constructs financial fields from the signed catalog quote. Wallet balances, commitments,
  risk checks and execution status are computed from chain/store state rather than model prose.
  A model can still misunderstand intent or generate misleading text.
- EIP-712 binds chain/module, account, provider/invoice, service hash, token, recipient, amount
  and expiry. Procurement checks the catalog binding; execution checks the registered signer,
  allowed recipient, current policy and consumed ID.
- A separate tool-free vendor parser extracts bounded service attributes from escaped untrusted
  content. Parser evaluation is not proof every runtime request traverses an injection-proof
  quarantine; the fixed-catalog procurement path and deterministic authorization remain essential.

### Contract and token controls

- Guardian stores policy/accounting on its own contract per account. For direct/lock transfers,
  Kernel calls the token through `executeFromExecutor`; escrow custody is explicitly separate.
- Installation/pause, version/time, signature, token/account, recipient, per-payment cap,
  aggregate UTC-day cap, reserve and permanently consumed IDs are checked on the guarded route.
- Effects precede token interaction. Batches contain at most ten invoices, transfer return
  semantics and exact account outflow/reserve are checked, and the module guard prevents tested
  cross-entry reentrancy. Any failed direct batch item reverts the batch; spent gas is not restored.
- Policy/session updates do not clear spending/replay protection. The spending day is a fixed
  UTC window. Supported assets assume standard ERC-20 behavior; adversarial token fixtures
  do not imply support for fee/rebase/callback token economics.

### Durability, reconciliation and service fulfillment

- Account leases/fencing and DB constraints separate business tasks from attempts, enforce
  one active payment attempt/account and bind batch members to an exact durable operation.
- Exact signed payload/hash/keyed nonce and membership are committed before send. An unknown
  result does not authorize a fresh-nonce payment. Automatic fee replacement is not implemented.
- Reconciliation matches canonical receipt/block/confirmations, EntryPoint hash/sender/nonce/
  success, Guardian events and consumed IDs. Conflicts or an unresolved active window lead to
  operation `needs_review` and local scheduling pause; `pending` is not proof of a dropped send.
- `needs_review` is an operation status, not a payment-task enum value. The task can remain
  `executing`/`escrowed` while review is required.
- Direct confirmed payment becomes `paid`; verified signed delivery and a fresh service probe
  are required for completion. Repeated delivery failure escalates without repaying the invoice.
- Local pause stops new scheduling, not already submitted chain effects, existing reconciliation,
  paid-service fulfillment or recovery of already locked escrows. On-chain pause and session
  revocation are distinct controls and do not undo settled transactions.

### Escrow-specific controls and assumptions

The single-invoice lock consumes the invoice and counts spending before pulling tokens into
Guardian. The provider stages an inaccessible namespace and signs bound delivery/readiness
data. The worker checks signatures/bindings and a staged probe before journaling/submitting
release. Normal access requires provider-side verification of a matching confirmed release.

Unreleased escrow is refundable only after the bounded deadline; anyone may submit the
refund transaction. There is no automatic on-chain timer. The worker defaults to a 600-second
window, bounded to 30–86400 seconds, and validates recovery-window authority. Pending escrow
blocks module uninstall. A same-day refund frees that day's capacity, but the consumed invoice
cannot be replayed. Provider signatures attest readiness, not quality or continuous availability.

### Reviewer and database isolation

Reviewer capabilities are workspace-specific, route-limited and short-lived, with bounded
request/model rates and session capacity. Internal signer/bundler listeners remain loopback.
Close/expiry prevents new access and closes resources after active requests finish. Tests
exercise a second independent wallet/database and reject cross-workspace access.

Migrations 0000–0007 define eleven internal RLS-enabled tables with no public-role policies.
Server roles remain privileged, so API authorization and DB credential custody still matter.
JSON object constraints and explicit `::text::jsonb` binding preserve the expected payload form.

## 5. Live adversarial regression and authorization evidence

Primary records: [cloud baseline](../docs/evidence/security-cloud-model-baseline.json),
[cloud regression](../docs/evidence/security-cloud-model-evaluation.json) and
[cloud validation summary](../docs/evidence/CLOUD-VALIDATION.md), captured October 18.

| Parameter | Recorded result |
| --- | --- |
| Model | Groq `openai/gpt-oss-120b`, strict JSON Schema, temperature 0, low reasoning effort and bounded serial requests. |
| Corpus | 30 unique cases repeated twice = 60 observations, including benign and explicit-wait controls. |
| Tracks | Planner 16, buyer 16, provider 12, vendor parser 16 observations. |
| Preserved baseline | 54 passes and 6 inconclusive API/schema errors out of 60; errors are not successful containment. |
| After protocol/schema correction | Planner 16/16, buyer 16/16, provider 12/12, vendor 16/16: **60/60 objectives passed**. |
| Test effects | Synthetic financial state; no payment submission or real signing credential in model prompts/tools. |

Cases include owner/role/prior-approval spoofing, drain/limit bypass, recipient/price
substitution, unlimited allowance requests and XML/HTML/Unicode/base64/structured-content
injection. The same corpus informed the correction, so the result is **in-sample regression**,
not sixty independent jailbreaks, a held-out benchmark or universal robustness.

Financial authorization is evaluated separately. [Actual Kernel evidence](../docs/evidence/security-kernel-fork.json)
records allowed payments and rejection of direct transfer/approval/admin, `transferFrom`,
permit selector, mixed/nested/delegatecall bypasses, hostile-plan drains, Kernel ERC-1271
session authority and operations after owner revocation. Permit-selector rejection uses a
fixture without EIP-2612; full token permit/Permit2 semantics are not claimed.

## 6. Reliability, public execution and latest local checkpoint

- [AI-01](../docs/evidence/AI-01-public-procurement.md): public Base Sepolia direct payment of
  0.26 MockUSD using historical local Qwen, with matching settlement, signed delivery, probe
  and unique-value write/read captured on October 17. The one-hour rental has expired.
- [Public escrow](../docs/evidence/public-escrow-procurement.json): separate index-1 account,
  GPT-OSS 120B/Groq, 0.26 MockUSD lock, provider-attested release and staged namespace activation,
  verified October 19. This is distinct from the reviewer fork.
- [Recovery tests](../tests/integration/durable-restart.test.ts) reopen an actual disk database
  and restart a worker process. The tested lost-response path reconciles the existing operation
  with one send, not a global exactly-once guarantee.
- [Reconciliation fixtures](../tests/integration/reconciliation.test.ts) cover reorg/receipt/
  nonce conflicts, partial settlement, consumed-without-receipt, head lag, timeout and outages.
- [COST-01](../docs/evidence/COST-01-local-batching.md) uses three warmed-snapshot repetitions
  per mode on a fork. Gas reductions are scheduler measurements, not production dollar economics.
- Recorded public-HTTPS reviewer checks use real model inference and fork-local chain execution.
  Ordinary browser tests use explicit wallet/API fixtures. These evidence levels are separate.

The October 20 checkpoint records **156 passed tests**: **105 integration, 8 web, 25 browser,
17 contract/fork and 1 Docker-context tooling**. Lint/typecheck/build and source-only packaging
passed. Editing this assessment does not rerun those suites or revalidate live endpoints.

## 7. Residual risks and follow-up

The priorities below are internal engineering assessments, not independent severity ratings.

| Priority | Residual risk | Current boundary / next work |
| --- | --- | --- |
| High | Undiscovered contract, permission or recovery defects | Internal tests are not an audit/formal proof; independent review, fuzz/invariant and deployment-specific testing remain needed. |
| High | Owner compromise, other modules or old allowances | These can bypass the intended agent route; inventory authority, use appropriate allowance hygiene and verify revocation. |
| High | Hot session/provider credentials or privileged DB compromise | Restricted keys still grant meaningful power; stronger isolation/rotation, access auditing and production key custody are future work. |
| High | Provider readiness oracle and direct-mode non-atomic delivery | A trusted signer can attest false/poor service; direct payments lack automatic delivery refunds. Define dispute/refund and independent monitoring. |
| Medium–high | Model injection or intent misalignment | An unnecessary within-policy purchase remains possible; extend held-out multilingual testing and assess false accepts/refusals independently of contract limits. |
| Medium–high | RPC/bundler ambiguity, deep reorg or crash races | Unknown/review states may need human resolution; broaden real multi-provider/pooler/process stress and operator tooling without blind retries. |
| Medium | Browser/server session compromise and limited enrollment | Tokens are accessible to same-origin code; authentication is single-owner/instance and not a full multi-tenant/contract-owner solution. |
| Medium | Fixed UTC window, gas and execution rate | Boundary bursts remain possible; native gas caps are per operation, not cumulative on-chain gas/rate policy. |
| Medium | Unsupported token semantics | Exact-delta assumptions require a reviewed asset set; standard token behavior is not guaranteed for arbitrary new tokens. |
| Medium | Batch latency and atomic failure radius | Default remains size 1; test queue/load/deadline trade-offs before opt-in aggregation. |
| Medium | Incomplete production cost/privacy evaluation | Cost excludes L1-data/commercial/model/hosting overhead; prompts reach an external model provider. Measure complete cost and minimize sensitive input. |
| Medium | Dependency/supply-chain change | Current scans report no known advisories, not absence of defects; retain reviewed pins, compatibility checks and regular reassessment. |
| Operational | Hosting entitlement, quotas, memory and network | Free/Trial availability and selected China probes do not establish a judging-network SLA; monitor the actual host and lifecycle. |
| Release | Testnet acceptance and revision/material drift | Label Base Sepolia/MockUSD explicitly; identify frozen source, deployed build and final submitted files separately. |

## 8. Dependency and release status

The latest recorded full `npm audit` and production `npm audit --omit=dev` both report
**0 known advisories**. A scoped override replaces only `@esbuild-kit/core-utils`'s esbuild
dependency with **0.25.12**, addressing the former four-moderate Drizzle/esbuild chain without
downgrading Drizzle. Clean `npm ci`, migration check/generation and legacy sync/async transforms
were verified. Earlier four-moderate counts are historical.

Docker context completeness is tested; the Docker image has not been built/run in this
Windows workspace. Model/host Free-tier status remains operator-controlled. Public testnet
receipts do not establish mainnet acceptance, independent provider quality or production scale.

References: [security tracker](../docs/security-assessment.md), [technical design](../docs/technical-documentation.md),
[current checkpoint](../docs/PROGRESS.md), [release checklist](../docs/RELEASE_CHECKLIST.md),
[reproduction guide](02-source-code-deployment-and-tests.md) and [technical submission document](01-technical-documentation.md).
