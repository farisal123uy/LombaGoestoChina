# Guardian Wallet

A TypeScript and Solidity monorepo for building goal-aware financial delegation with
bounded agent authority. International Track, Topic F.

## Current stage

The A+B wallet/backend foundation is implemented on `feat/wallet-agent-backend`:
Guardian ERC-7579 executor, restricted Kernel/session helpers, provider-signed quotes,
bounded planner, owner API, SQL-backed task queue and a persist-before-send worker.
The web application includes sponsored owner onboarding at `/setup` and financial
procurement at `/dashboard`. See the [progress checkpoint](docs/PROGRESS.md),
[runtime guide](docs/PROCUREMENT_RUNTIME.md) and [A+B API handoff](docs/ab-handoff.md).
Teammate frontend setup: [Frontend handoff](docs/FRONTEND_HANDOFF.md).

Verification: 36 integration tests, 14 contract/fork cases and six browser cases
passed. Supabase is migrated through `0003`, and real local Qwen/provider quote
preview succeeded. Public deployment and the first **0.26 MockUSD procurement with
verified service delivery** are confirmed: [AI-01 evidence](docs/evidence/AI-01-public-procurement.md).
Broader evaluation, queue batching economics and final demo remain.
Local fork and browser-fixture evidence is labeled separately from public execution.

The configured model is **Qwen `qwen3:8b` via local Ollama**. Supabase connection,
migrations and RLS on nine internal tables are verified. See the synthetic
[Qwen smoke evaluation](docs/evidence/qwen-local-evaluation.json) and real
[provider quote preview](docs/evidence/provider-live-preview.json).

Owner onboarding is available at **`/setup`**. Run `npm run onboarding` in a second
terminal, then connect MetaMask to sign the sponsored bootstrap and scoped session.
See [Sponsored Setup](docs/SPONSORED_SETUP.md). The configured owner has completed
deployment/session signatures: [public manifest](docs/evidence/public-deployment.json).
For procurement, run `npm run runtime:dev` with web running, then use `/dashboard`.
A local-fork test verifies bootstrap/session payment with zero owner/account ETH.

## Requirements

- Node.js 22.13.0 or newer; initial environment: Node.js 22.17.1.
- npm 10; one root install and one root `package-lock.json`.
- No API key, database, or funded wallet is needed to run the initial scaffold.

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if script execution policy prevents
invoking `npm` or `npx` directly.

## Quick start

Run these commands from the `guardian-wallet` directory:

```sh
npm ci
npm run dev
```

`dev` builds the shared packages, then starts the three base applications below.
For the configured provider workflow, run web separately and use `runtime:dev` to
start API/worker plus provider-agent/signer; see the runtime guide above.

| Service | Location | Current behavior |
| --- | --- | --- |
| Web | http://localhost:3000 | Landing page, `/setup` and `/dashboard`. |
| API | http://localhost:4000/health | Process health. |
| API status | http://localhost:4000/v1/status | Implementation and financial-runtime configuration status. |
| Worker | Terminal output | Heartbeat by default; configured execution requires an authorized session and local start. |

Press Ctrl+C to stop the development processes. Rebuild shared packages after editing
their source, or restart `npm run dev` so consumers receive the updated output.

## Repository structure

```text
guardian-wallet/
  apps/
    web/                  Next.js, React, Tailwind
    api/                  Fastify service
    worker/               Executor process boundary
  packages/
    shared/               Types, status definitions, development chain
    planner/              AI planner interface and SDK dependencies
    wallet/               Read client and executor interface
    database/             Drizzle schema, client, migrations
  contracts/
    contracts/            Solidity; MockUSD fixture
    test/                 Contract acceptance-test plan
    ignition/modules/     MockUSD deployment module
    hardhat.config.ts
  tests/
    integration/          Integration-test plan
    e2e/                  Browser-test plan
  docs/
    architecture.md
    security-assessment.md
    evaluation.md
    execution-evidence.md
    roadmap.md
  .env.example
  package.json
  package-lock.json
```

All workspace packages are private. Root scripts build shared packages before their
consumers. Dependencies are resolved through the root lockfile; do not create a
separate lockfile in each workspace.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build packages and start all three applications. |
| `npm run dev:web` | Start the dashboard after packages have been built. |
| `npm run dev:api` | Start the API after packages have been built. |
| `npm run dev:worker` | Start the heartbeat worker after packages have been built. |
| `npm run owner:setup` | Build and run web + local sponsored owner onboarding together. |
| `npm run onboarding` | Run only the local signing coordinator when web is already running. |
| `npm run runtime:dev` | Build/configure and start API, worker, separate provider agent/signer; web runs separately. |
| `npm run provider:configure` | Provision ignored local provider tokens/endpoints and synchronize worker DB. |
| `npm run provider:check -- --temporary-runtime --record` | Live model/signed-invoice preview on an empty paused queue; no payment task/submission. |
| `npm run wallet:verify -- --record` | Verify public bootstrap receipt/policy and record sanitized evidence. |
| `npm run wallet:procurement:verify -- --record` | Independently verify an existing public procurement/receipt and live service probe when active. |
| `npm run wallet:deployment-quote` | Check the full bootstrap quote without owner signing or transaction submission. |
| `npm run build:packages` | Build the four shared workspaces. |
| `npm run lint` | Lint repository code. |
| `npm run typecheck` | Build shared types and type-check all workspaces. |
| `npm run build` | Build applications and compile contracts. |
| `npm run test:contracts` | Run policy tests; fork case is opt-in. |
| `npm run test:kernel` | Require RPC and run actual Kernel/EntryPoint local-fork integration. |
| `npm run test:integration` | Run SQL/owner API/planner/worker recovery tests. |
| `npm run test:e2e` | Run browser tests as they are implemented. |
| `npm run db:generate` | Generate migrations from the reviewed Drizzle schema. |
| `npm run db:migrate` | Apply migrations using the database workspace environment. |

Contract, backend, owner-onboarding and dashboard browser tests are implemented.
Install Playwright's Chromium browser before running browser tests:

```sh
npx playwright install chromium
```

## Environment configuration

Panduan setup akun/credential berbahasa Indonesia:
[Setup layanan](docs/SETUP_LAYANAN.md). Jalankan `npm run setup:services` di terminal
interaktif; input credential disembunyikan. `npm run services:check -- --network`
memeriksa koneksi secara read-only dan hanya mencetak status.

Runtime files are optional for the scaffold and are ignored by Git:

| Template | Local destination | Scope |
| --- | --- | --- |
| `apps/web/.env.example` | `apps/web/.env.local` | Public API URL only. |
| `apps/api/.env.example` | `apps/api/.env` | API/auth, account, RPC, database, Ollama endpoint/model and optional gateway token. |
| `apps/worker/.env.example` | `apps/worker/.env` | Restricted session, DB/bundler RPC, native gas cap and confirmations. |
| `packages/database/.env.example` | `packages/database/.env` | Database migration connection. |
| `contracts/.env.example` | `contracts/.env` | Network-specific contract tooling. |

The root `.env.example` is an index, not a shared secret file. Configure each deployed
service independently. The owner key stays in the user's wallet; delegated
agent credentials belong only to the executor runtime.

## Development network

Base Sepolia, chain ID **84532**, is the initial development network. MockUSD is a
six-decimal fixture and is not USDC. Confirm the organizers' acceptance of testnet
evidence before choosing the submission network.

## Next milestone

Extend security/economics evaluation and deploy the hosted runtime following the
first successful public procurement/delivery. [PROGRESS.md](docs/PROGRESS.md) records the verified checkpoint and
next owner action; `docs/ab-handoff.md` documents API boundaries.

The revised target demo is **Astra as an AI Enterprise Node**, procuring a database
service from a provider agent with bounded micro-payments. These are design targets,
not a completed product demo. See [workflow and branches](docs/workflow.md),
[architecture](docs/architecture.md), [adversarial evaluation](docs/evaluation.md),
and the [five-minute demo script](docs/demo-script.md). Branch names in the workflow
are proposals except the active A+B branch. Local/fork evidence is recorded separately
from public deployment and human/model evaluation.
