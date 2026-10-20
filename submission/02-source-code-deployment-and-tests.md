# Source Code, Deployment and Test Guide — Guardian Wallet: Astra

- **Last aligned:** October 20, 2026.
- **Source basis:** `feat/batching-evaluation`, based on `b439c8fb5662acb13724314923951bb11091b71a` with the October 20 project updates; exact revision is identified by Git HEAD or the source inventory.
- **Related documents:** [technical documentation](01-technical-documentation.md), [security self-assessment](03-security-self-assessment.md), [presentation material](PRESENTATION_MATERIAL.md).

## 1. Repository and revision identity

| Reference | Location / interpretation |
| --- | --- |
| Repository | <https://github.com/farisal123uy/LombaGoestoChina> |
| Development branch | [feat/batching-evaluation](https://github.com/farisal123uy/LombaGoestoChina/tree/feat/batching-evaluation) |
| Base commit | [b439c8fb5662acb13724314923951bb11091b71a](https://github.com/farisal123uy/LombaGoestoChina/commit/b439c8fb5662acb13724314923951bb11091b71a), October 19. |
| Current local entry point | [README.md](../README.md). The [GitHub README](https://github.com/farisal123uy/LombaGoestoChina/blob/feat/batching-evaluation/README.md) reflects the published branch version. |
| Current checkpoint/history | [PROGRESS.md](../docs/PROGRESS.md) and [release checklist](../docs/RELEASE_CHECKLIST.md). |

A branch label alone does not prove that a checkout, remote source and the hosted deployment
are identical. A remote clone follows the version actually published to that branch. Exact
reproduction requires the reviewed commit or a source archive with its SHA-256 inventory;
verify the deployed build separately.

## 2. Repository layout

```text
apps/
  web/          Next.js owner setup/dashboard, evidence and reviewer interface
  api/          Financial API, authentication, assistant, provider and review host
  worker/       Restricted execution, batching, reconciliation and fulfillment
  reviewer/     Production dependency boundary for the isolated reviewer runtime
packages/
  shared/       Request/response, payment and service schemas
  planner/      Structured model client, bounded decisions, batching and wallet calculations
  wallet/       Kernel/session, Guardian, quote validation and execution helpers
  database/     Drizzle schema, migrations, payment/provider stores
contracts/      GuardianPayments, demo tokens, deployment modules and policy/fork tests
tests/          Integration, browser, tooling and test helpers
tools/          Setup, provider/reviewer runtime, diagnosis, evaluation and source release
deployment/     Reviewer hosting configuration and environment template
docs/           Active technical, operational, security and evidence documentation
docs/archive/   Historical plans, early storyboard and cancelled inquiry drafts
submission/     Team-maintained Markdown, PPTX files and screen recording
Dockerfile      Owner API/worker runtime, selected through SERVICE
Dockerfile.review  Separate reviewer runtime image
```

The retired presentation generator has been removed. Submission materials are maintained
directly in `submission/`; no presentation-generation dependency is required by the application.

## 3. Requirements and installation

- **Node.js ≥22.13.0**, **npm 10**; the package manifest specifies npm 10.9.2.
- One root `package-lock.json` and root install; workspace packages are private.
- Git/network access for installation; Playwright Chromium for browser tests.
- Git LFS to download the large submission recording with `git lfs pull`; it is not required by the application runtime.
- Configured Groq access for live inference; a Base Sepolia read RPC for optional fork tests.
- Python **3.9+** only for source-only packaging; Docker only for the image workflow.

To clone the published branch in PowerShell:

```powershell
git clone --branch feat/batching-evaluation --single-branch https://github.com/farisal123uy/LombaGoestoChina.git
Set-Location LombaGoestoChina
npm.cmd ci
```

For an existing checkout or the current working-tree snapshot, run commands from its root
(`guardian-wallet-stage2` in the local workspace). PowerShell users can use `npm.cmd` and
`npx.cmd` when execution policy prevents invoking `npm`/`npx` directly.

## 4. Basic local application

```powershell
npm.cmd run dev
```

This builds shared packages and starts web, financial API and worker. Without financial
configuration, the API provides health/status and financial routes are unavailable; worker
execution defaults to disabled. Partial financial configuration can cause startup rejection.

| Process / endpoint | Default location |
| --- | --- |
| Web | `http://localhost:3000` — landing, setup, dashboard, evidence and reviewer entry UI. |
| API process health | `http://localhost:4000/health`. |
| API configuration status | `http://localhost:4000/v1/status`. |
| Worker | Terminal heartbeat; execution additionally requires configuration, authority and scheduling. |

`dev` does not start the onboarding coordinator, provider agent/signer or reviewer host.
A rendered page or healthy API alone is not evidence that procurement/payment is ready.

## 5. Owner setup and public-testnet procurement

### First-time setup

Configure the database, execution RPC, ZeroDev bundler/sponsorship and owner EOA, then
configure Groq and apply the current migration set:

```powershell
npm.cmd run setup:services
npm.cmd run setup:ai-cloud
npm.cmd run db:migrate
npm.cmd run owner:setup
```

`owner:setup` builds packages, API/coordinator and contracts, then starts web plus the
loopback coordinator at **127.0.0.1:4100**. At `/setup`, the owner separately signs login,
deployment and scoped session authorization in MetaMask. Confirm deployment and runtime
synchronization before proceeding. This workflow can submit public Base Sepolia operations;
the owner private key is not entered into the API or application UI.

Source migrations are **0000–0007**. Batch membership uses 0004/0005; escrow journals/staged
access use 0006/0007. Their presence does not establish the migration level of a hosted DB.
Existing valid setup may be reused; logging in again does not renew an expired policy/session.

### Procurement runtime

After setup, stop `owner:setup` and use two terminals:

```powershell
# Terminal 1: API, worker, provider agent and provider signer/service
npm.cmd run runtime:dev

# Terminal 2: frontend
npm.cmd run dev:web
```

`runtime:dev` builds packages/API/worker, provisions provider configuration and synchronizes
the relevant database/provider settings. Provider agent and signer/service listen on loopback
**4200** and **4201**. With web already running, `npm.cmd run onboarding` starts only the coordinator.

1. Open `/dashboard` and authenticate with the configured owner on Base Sepolia.
2. Use the wallet assistant to request a catalog database; inspect its invoice/payment review.
3. Choose **Queue reviewed payments**, then **Start agent** if scheduling is paused.
4. Follow the task and its operation evidence; verify the namespace probe and KV write/read.

Assistant procurement creates a non-executable draft. **Direct service request** instead
can store an eligible task directly as `planned`, which may execute when scheduling is active.
**Start agent** enables the queue; it does not start a missing worker process or change
on-chain permission. Task selection is scoped to the active Kernel account. Expired
unsubmitted invoices can be cancelled; submitted/unknown operations must be reconciled.

Owner runtime defaults to direct settlement, batch size 1/window 0. Escrow is opt-in and
single-invoice; its deployment/session must support the additional selectors. The public
escrow example uses Kernel index 1, separately authorized from the index-0 direct account.

API and coordinator logins each last 15 minutes. Frontend restoration is per tab and checks
wallet/network/expiry plus `/auth/session`. It does not renew payment authority. For read-only
diagnosis use `npm.cmd run wallet:diagnose`; `-- --ai` adds one inference request.

Guides: [service setup](../docs/SETUP_LAYANAN.md), [cloud AI](../docs/AI_CLOUD.md),
[owner workflow](../docs/OWNER_DEMO_GUIDE.md), [escrow](../docs/ESCROW_PROTOTYPE.md).

## 6. Reviewer runtime and deployment

### Local isolated reviewer

```powershell
npm.cmd run setup:ai-cloud
npm.cmd run review:build
npm.cmd run review:start
```

The default local URL is **http://127.0.0.1:3100/review**, with a loopback review host on
**4300**. Use the reported URL if ports are overridden. The private access link is stored in
`.local/review/reviewer-link.txt`; `.local/review/runtime-state.json` records startup metadata.

The current factory creates disposable owner/session/provider credentials, a Kernel account,
Guardian/token contracts and a separate PGlite database on a Base Sepolia fork. It exercises
escrow using the configured hosted model. Reviewers need no MetaMask, personal funds or
model API account. Capabilities last 15 minutes and expose only allowed workspace routes.
Closing/expiry discards the workspace even if the catalog rental term is longer.

### Recorded public hosting

- Reviewer: <https://preview-95c94201191f7206.up.railway.app/review>.
- Evidence: <https://preview-95c94201191f7206.up.railway.app/evidence>.
- The team supplies the access code privately.
- Recorded deployed source/build ID: `912063431ea05c663abd9df36bdff047687006d5cf8ea9fde87ba8b9b0f9d9c0`.

That build ID belongs to the October 18 hosting capture, not automatically to today's
working tree. `release:deployment-check` compares local runtime source with the saved
deployed inventory; subsequent local changes can legitimately produce a mismatch.
`release:readiness` additionally checks public readiness/authentication and recorded gates.
A passing historical capture is not a current availability guarantee or proof of source equality.

Cloud inference is real in the recorded live workflow, while reviewer transactions remain
fork-local. The later public owner escrow receipt is separate evidence. See
[cloud validation](../docs/evidence/CLOUD-VALIDATION.md) and [reviewer guide](../docs/REVIEWER_GUIDE.md).

### Docker and hosted configuration

[Dockerfile.review](../Dockerfile.review) builds web/API/worker/contracts and runs the reviewer;
the primary [Dockerfile](../Dockerfile) runs the owner API/worker. Use
[deployment/review.env.example](../deployment/review.env.example) for the reviewer variable inventory:

- `GROQ_API_KEY`, `GROQ_FREE_TIER_CONFIRMED=true` for the operator-confirmed account tier.
- `AI_MODEL_ID=openai/gpt-oss-120b`.
- `REVIEW_ACCESS_CODE`: at least 32 unpredictable characters, shared privately.
- `KERNEL_FORK_RPC_URL=https://sepolia.base.org`: fork reads; simulated-chain writes stay local.
- `REVIEW_MAX_SESSIONS=1` and `PORT=7860` in the initial hosted profile.
- Optional `REVIEW_BUILD_ID`: public full Git SHA or source archive SHA-256, never a secret.

```powershell
docker build -f Dockerfile.review -t guardian-review .
docker run --rm -p 7860:7860 --env-file C:\private\review.env guardian-review
```

Supply actual secrets through a private environment file or hosting secret settings, not
build arguments. The review API stays loopback; web exposes the same-origin proxy.
Review-only mode redirects owner setup/dashboard pages to `/review`. Dev dependencies are
pruned; required frontend evidence JSON is explicitly allowed in the Docker context.

`GET /api/review/health` checks process liveness. `GET /api/review/ready` checks model catalog,
fork source and capacity status; neither proves successful inference/settlement. Verify a
complete workspace flow, isolation/cleanup, build ID and resource use before reporting a rollout.
The local checkpoint tested the context allowlist; the Docker image has not been built/run
in this Windows workspace. Recorded native Linux validation is a separate evidence level.

## 7. Tests and reproduction

After installation, prepare compiled outputs and run local checks:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:integration
npm.cmd run test:web
npm.cmd run test:tooling
npm.cmd run test:contracts
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

These suites do not need owner signing credentials or a live model key; browser/model/chain
responses are explicit fixtures where applicable. Contract tests without the fork variable
run **12 local policy cases** and skip **5 fork cases**. To execute all **17**:

```powershell
$env:KERNEL_FORK_RPC_URL="https://sepolia.base.org"
npm.cmd run test:contracts
```

`npm.cmd run test:kernel` selects only the Kernel case, not the entire fork suite. The
preceding build is important because reviewer tests import compiled API/worker output.
Typecheck covers workspace sources and root TypeScript integration/browser test sources.

| Suite | Latest recorded local checkpoint, October 20 |
| --- | ---: |
| Integration | 105/105 |
| Web unit | 8/8 |
| Chromium browser | 25/25 |
| Contract/fork with RPC opt-in | 17/17 |
| Docker-context tooling | 1/1 |
| **Total** | **156/156** |

Lint, typecheck, production build and source-only packaging passed. Full/production dependency
scans last reported zero known advisories. These are recorded checks, not new results created
by editing this document. [Progress](../docs/PROGRESS.md) retains historical checkpoints.

Coverage includes owner/account isolation, quote/schema/policy rejection, aggregate caps,
atomic rollback, session bypass/revoke, batch membership, exact-operation restart recovery,
receipt/nonce/reorg conflicts, delivery retry without repayment, reviewer capability isolation,
session restoration, expired invoice cancellation, AI quota UI and required Docker evidence inputs.

Additional evaluations:

```powershell
npm.cmd run test:cost
npm.cmd run model:cloud
npm.cmd run model:compare
npm.cmd run model:security
```

`test:cost` records isolated-fork measurements. Model commands use configured live inference
and quota with synthetic inputs, not payment submission. Recording commands update evidence
files; preserve the capture's model, date, source hashes and limitations.

## 8. Configuration and secret scope

| Template | Local destination / purpose |
| --- | --- |
| `apps/web/.env.example` | `apps/web/.env.local`: public API/coordinator URLs only. |
| `apps/api/.env.example` | `apps/api/.env`: owner/account/module, DB/RPC, model and provider configuration. |
| `apps/worker/.env.example` | `apps/worker/.env`: restricted session, DB/RPC/bundler, gas/paymaster, batching and mode. |
| `packages/database/.env.example` | `packages/database/.env`: migration connection. |
| `contracts/.env.example` | `contracts/.env`: selected network tooling. |
| `deployment/review.env.example` | Private host environment: model, review capability, port, capacity and build marker. |

The root `.env.example` is an index. `.local/` contains active credentials and onboarding
journals as well as generated artifacts; it is not entirely disposable cache. Owner keys
stay in the wallet. Worker/provider credentials remain separate from model and financial
API processes. Never publish actual keys, credential URLs, bearer/access codes or signed journals.

## 9. Source freeze and submission materials

`submission/` contains four Markdown documents, four PPTX files and one screen recording
maintained by the team. This revision aligns Markdown; it does not certify updated PPTX/video content.
The MP4 is stored through Git LFS; source-only review archives exclude that binary.

```powershell
npm.cmd run release:source
```

With Python 3.9+, this creates `.local/release/Guardian-Wallet-source-review.zip` with a
`SOURCE-INVENTORY.json`, dependency/license metadata and hashes. It supports uncommitted
working-tree deletions/renames, excludes private runtime/dependency files and presentation/video
binaries, and rechecks archive entries. Selected-pattern credential scanning is not a universal
secret proof. A source-only archive is not the final presentation/video bundle or an upload receipt.

Final review should identify the actual frozen revision/archive, deployed build and submitted
materials independently. See the [release checklist](../docs/RELEASE_CHECKLIST.md),
[technical design](../docs/technical-documentation.md), [security assessment](03-security-self-assessment.md),
[review deployment](../docs/REVIEW_DEPLOYMENT.md) and [archive index](../docs/archive/README.md).
