# Guardian Wallet: Astra

**An AI agent wallet whose spending limits are enforced on-chain, not by the AI.**
International Track, Topic F (Agent Wallet).

An owner delegates database-service procurement to Astra through a restricted smart-account
session. AI models interpret goals and propose payment decisions; deterministic code verifies
signed invoices, and **GuardianPayments**, an ERC-7579 executor module installed on Kernel,
enforces spending policy. Models hold no signing keys; a separate worker holds the scoped session.

## At a glance

| Area | Current implementation |
| --- | --- |
| Scenario | Procure an expiring PostgreSQL JSONB key/value namespace from a team-operated provider. |
| Application | TypeScript, Next.js/React, Fastify API, executor worker, PostgreSQL/Drizzle; PGlite for isolated tests/reviewer workspaces. |
| On-chain | Solidity 0.8.28, GuardianPayments, ZeroDev Kernel 0.3.1, EntryPoint 0.7, Hardhat 3. |
| AI | `openai/gpt-oss-120b` via Groq; bounded structured output and no automatic model fallback. Alternatives and legacy Ollama support are explicit opt-ins. |
| Network/asset | Base Sepolia, chain ID **84532**; **MockUSD**, a six-decimal test token with no claimed USD value. |
| Reviewer | [Hosted workspace](https://preview-95c94201191f7206.up.railway.app/review) · [recorded evidence](https://preview-95c94201191f7206.up.railway.app/evidence). Access code supplied privately by the team. |

## Implemented features

- **Owner onboarding:** MetaMask login, sponsored bootstrap, policy installation and separate
  session authorization at `/setup`. Owner keys stay in the wallet.
- **Wallet workspace:** English/Indonesian assistant, asset/budget overview, deterministic
  payment-policy risk checks, invoice drafts, explicit queue release and task receipts at `/dashboard`.
- **Authenticated procurement:** separate provider AI and signer processes; fixed-catalog
  EIP-712 quotes bind chain/module, account, provider/invoice, service, token, recipient, amount and expiry.
- **Policy-bound settlement:** recipient allowlist, per-payment/UTC-day limits, protected reserve,
  expiry, pause, replay protection and atomic token-transfer checks. Default settlement is direct;
  opt-in escrow adds provider-attested release or timeout refund.
- **Durable execution:** persist the exact signed operation before sending; reconcile uncertain
  outcomes without blind repayment. Direct mode supports batches of **1–10** invoices, default **1**;
  escrow mode requires one invoice. Delivery retries do not repeat a payment.
- **Disposable reviewer:** `/review` creates an isolated wallet, contracts and database on a local
  Base Sepolia fork. `/evidence` displays labeled historical public, fork and model captures.

The demo bootstrap mints **10 MockUSD**, with a **6** protected reserve, **1** per-payment limit
and **2** UTC-day cap. Catalog offers are **1 MiB / 1 hour / 0.26 MockUSD** and
**4 MiB / 4 hours / 0.52 MockUSD**. These are managed test namespaces, not dedicated database instances.

## How it works

```text
Owner wallet -> Kernel account + Guardian policy + scoped session
User goal -> authenticated API -> Astra <-> provider agent
                                            |
                               deterministic provider signer
                                            |
                            verified quote + PaymentPlan -> PostgreSQL
                                            |
                            worker: validate -> persist -> submit
                                            |
                               EntryPoint -> Kernel -> Guardian
                                            |
                         settlement/escrow -> delivery signature + probe
```

The restricted session excludes arbitrary token transfers/approvals, administration and
arbitrary message signatures. Direct payments move tokens from Kernel through its executor
route; escrow temporarily holds the quoted amount in Guardian. `paid` confirms direct
settlement, `escrowed` confirms a lock, and `completed` requires delivery verification.
Local scheduling pause is separate from on-chain pause or session revocation.

## Run the project

### Hosted reviewer

Open the reviewer URL above and follow the [reviewer guide](docs/REVIEWER_GUIDE.md).
No MetaMask, personal funds or reviewer-owned model API account is needed. The hosted
workspace exercises escrow on an isolated fork. Sessions last 15 minutes; sandbox
transactions are **fork-local**, not public broadcasts.

### Local application

Requirements: **Node.js ≥22.13.0**, **npm 10**, and one root install/lockfile.
Run from the repository root (`guardian-wallet-stage2` in this checkout):

```sh
npm ci
npm run dev
```

The two submission videos are tracked with Git LFS. Git LFS is needed only to
download that media (`git lfs pull`); the application does not depend on the videos.

Web: **http://localhost:3000** · API: **http://localhost:4000/health** ·
runtime status: **http://localhost:4000/v1/status**. Without financial configuration,
the API exposes health/status and the worker runs with execution disabled.
`dev` starts web/API/worker; the configured procurement workflow below also needs the provider processes.

### Owner setup and procurement

For first-time public-testnet setup, configure the database, Base Sepolia RPC, ZeroDev
bundler/sponsorship and owner address, then configure the Groq key:

```sh
npm run setup:services
npm run setup:ai-cloud
npm run db:migrate
npm run owner:setup
```

At **`/setup`**, connect the configured owner in MetaMask, review/sign deployment,
wait for confirmation and authorize the scoped session. This flow submits public Base Sepolia
operations. Existing valid setup can be reused; sign-in alone does not deploy or renew authority.
See [service setup](docs/SETUP_LAYANAN.md), [cloud AI](docs/AI_CLOUD.md) and
[owner demo guide](docs/OWNER_DEMO_GUIDE.md) for prerequisites and recovery.

After setup, stop `owner:setup` and use separate terminals:

```sh
# Terminal 1: API, worker, provider agent and provider signer
npm run runtime:dev

# Terminal 2: frontend
npm run dev:web
```

Open **`/dashboard`**, sign in with the owner, request a database through the wallet
assistant, review the draft, choose **Queue reviewed payments**, then **Start agent**.
Follow the task to `completed` and verify the database probe/write-read.
**Direct service request** queues a plan immediately and may execute when scheduling is already active.
For delegation management with web already running, use `npm run onboarding` in another terminal.

### Configuration boundaries

Each service loads its own ignored environment file; templates are supplied alongside it.

| Local file | Scope |
| --- | --- |
| `apps/web/.env.local` | Public API/onboarding URLs only (`NEXT_PUBLIC_*`). |
| `apps/api/.env` | Owner/account addresses, database/RPC, model and provider endpoints/tokens. |
| `apps/worker/.env` | Restricted session, database/RPC/bundler, gas, batching and settlement mode. |
| `packages/database/.env` | Database migration connection. |
| `contracts/.env` | Optional network-specific contract tooling. |

The root `.env.example` is an index. Keep `.local/` credentials and onboarding journals private;
models/frontend never receive signing secrets. Escrow requires its migrations, compatible Guardian
deployment and owner-authorized selectors; follow the [escrow guide](docs/ESCROW_PROTOTYPE.md).
On Windows PowerShell use `npm.cmd`/`npx.cmd` if script policy blocks `npm`/`npx`.

## Verification and recorded evidence

Latest local checkpoint: **156 passing tests** — 105 integration, 8 web, 25 browser,
17 contract/fork and 1 Docker-context tooling case. Details and history: [PROGRESS.md](docs/PROGRESS.md).
Run checks after installing dependencies; the build also prepares API/worker output used by fork tests:

```sh
npm run lint
npm run typecheck
npm run build
npm run test:integration
npm run test:web
npm run test:tooling
npm run test:contracts
npx playwright install chromium
npm run test:e2e
```

Without `KERNEL_FORK_RPC_URL`, contract tests run **12 local policy cases** and skip
**5 fork cases**. To run all 17 in PowerShell:

```powershell
$env:KERNEL_FORK_RPC_URL="https://sepolia.base.org"
npm.cmd run test:contracts
```

For Bash: `KERNEL_FORK_RPC_URL=https://sepolia.base.org npm run test:contracts`.
Browser tests use wallet/API fixtures; fork tests execute actual contracts on an isolated chain.

| Recorded result | Evidence | Execution scope |
| --- | --- | --- |
| Owner-signed bootstrap, installed policy and recorded session authorization | [Deployment](docs/evidence/public-deployment.json) | Public Base Sepolia. |
| AI-01: 0.26 MockUSD direct payment, signed delivery and database probe/write-read | [AI-01 report](docs/evidence/AI-01-public-procurement.md) · [transaction](https://sepolia.basescan.org/tx/0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d) | Historical public local-Qwen run. |
| Escrow lock, provider-attested release and staged namespace activation | [Escrow receipt](docs/evidence/public-escrow-procurement.json) | Public GPT-OSS run on a separately authorized Kernel index 1 account. |
| Hostile-planner/bypass rejection, revocation and lost-response recovery | [Kernel evidence](docs/evidence/security-kernel-fork.json) · [reconciliation tests](tests/integration/reconciliation.test.ts) | Actual Kernel/EntryPoint fork execution plus explicit chain-driver fixtures. |
| 4/7-invoice batching: **58.59% / 67.87%** lower enclosing EVM gas | [COST-01](docs/evidence/COST-01-local-batching.md) | Three repetitions per mode on a local fork; excludes OP L1-data/commercial pricing. |
| GPT-OSS 120B selected security regression: **60/60 observations** | [Cloud validation](docs/evidence/CLOUD-VALIDATION.md) · [raw results](docs/evidence/security-cloud-model-evaluation.json) | 30 cases repeated twice; preserved baseline 54/60 with six API/schema errors. In-sample regression. |

Recorded captures do not establish current host/service availability. Historical Qwen results
remain separate from GPT-OSS evidence; expired namespace liveness applies only at capture time.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run wallet:diagnose` | Read-only policy, queue and provider diagnosis; `-- --ai` adds one model request. |
| `npm run services:check -- --network` | Read-only configured service connectivity checks. |
| `npm run wallet:verify -- --record` | Verify an existing public bootstrap. |
| `npm run wallet:procurement:verify -- --record` / `npm run wallet:escrow:verify -- --record` | Verify existing procurement receipts; no new payment. |
| `npm run test:cost` | Run and record the isolated-fork batching comparison. |
| `npm run model:cloud` / `npm run model:compare` / `npm run model:security` | Live-model smoke, comparison and selected regression; requires configured model access/quota. |
| `npm run release:source` | Create a source-only review archive; requires Python 3.9+. |

For a locally hosted reviewer, build with `npm run review:build`, then run
`npm run review:start` with cloud AI configured. Deployment details are in the
[review deployment guide](docs/REVIEW_DEPLOYMENT.md). Native Linux workflow verification
is recorded; the Docker image has not been built/tested in this Windows workspace.

## Repository layout

```text
apps/         web, API, worker; reviewer runtime dependency boundary
packages/     shared schemas, planner, wallet/Kernel helpers, database/migrations
contracts/    GuardianPayments, demo tokens, policy/fork tests and deployment modules
tests/        integration, browser, tooling and test helpers
tools/        service setup, provider/reviewer runtime, diagnosis, evaluation and release
deployment/   reviewer hosting configuration and environment template
docs/         active guides, technical/security documentation and evidence
docs/archive/ historical plans, early storyboard and cancelled inquiry drafts
submission/   team-maintained PPTX, Markdown documents, demo and presentation videos
```

Documentation: [technical design](docs/technical-documentation.md),
[security assessment](docs/security-assessment.md), [wallet assistant](docs/WALLET_ASSISTANT.md),
[batching/cost](docs/BATCHING_AND_COST.md), [release checklist](docs/RELEASE_CHECKLIST.md),
[archive index](docs/archive/README.md), and [presentation material](submission/PRESENTATION_MATERIAL.md).
The [submission index](submission/README.md) lists the four PPTX decks, two videos,
durations and release references. Maintain submission files directly in `submission/`;
the old presentation generator is retired.

## Known limits

- **Scoped authority:** reserve/limit enforcement covers the configured agent route;
  owner actions, other modules and prior allowances remain separate trust boundaries.
  Gas caps are per operation, not a cumulative on-chain gas policy. Daily caps use a fixed UTC window.
- **Prototype operations:** single configured owner/account per financial API instance,
  in-memory login sessions, privileged server DB access and process-held session/provider credentials.
- **Provider trust:** the team operates both provider processes and the real test namespace service.
  Escrow attests readiness through the provider signer; it cannot prove service quality or uptime.
- **Evidence scope:** MockUSD/testnet receipts and local-fork gas savings do not establish mainnet
  economics. The team chose Base Sepolia; organizer acceptance is not claimed.
- **Security/availability:** no independent audit or universal prompt-injection immunity claim.
  The latest full/production dependency scans reported zero known advisories; hosting and model
  Free-tier quotas still affect availability. See the linked assessment and progress for scope.
