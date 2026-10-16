# Guardian Wallet

A TypeScript and Solidity monorepo for building goal-aware financial delegation with
bounded agent authority. International Track, Topic F.

## Current stage

This repository is a runnable development scaffold. It includes a Next.js landing
page, Fastify health/status endpoints, a heartbeat worker, shared package boundaries,
a draft database schema, and a Hardhat test-token workspace.

Owner authentication, AI planning, Kernel account setup, restricted signing, policy
enforcement, and financial execution still require implementation. The worker does
not send transactions, and the UI displays implementation status rather than sample
financial results.

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

`dev` builds the shared packages, then starts:

| Service | Location | Current behavior |
| --- | --- | --- |
| Web | http://localhost:3000 | Development landing page and API health check. |
| API | http://localhost:4000/health | Process health. |
| API status | http://localhost:4000/v1/status | Pending capabilities and development-chain metadata. |
| Worker | Terminal output | Heartbeat with execution disabled. |

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
| `npm run build:packages` | Build the four shared workspaces. |
| `npm run lint` | Lint repository code. |
| `npm run typecheck` | Build shared types and type-check all workspaces. |
| `npm run build` | Build applications and compile contracts. |
| `npm run test:contracts` | Run Hardhat tests as they are implemented. |
| `npm run test:integration` | Run integration tests as they are implemented. |
| `npm run test:e2e` | Run browser tests as they are implemented. |
| `npm run db:generate` | Generate migrations from the reviewed Drizzle schema. |
| `npm run db:migrate` | Apply migrations using the database workspace environment. |

Test directories currently contain acceptance plans, not passing policy or financial
test suites. Vitest and Playwright report no tests until actual cases are added.
Install Playwright's Chromium browser when implementing browser tests:

```sh
npx playwright install chromium
```

## Environment configuration

Runtime files are optional for the scaffold and are ignored by Git:

| Template | Local destination | Scope |
| --- | --- | --- |
| `apps/web/.env.example` | `apps/web/.env.local` | Public API URL only. |
| `apps/api/.env.example` | `apps/api/.env` | API port, origin, future model/database credentials. |
| `apps/worker/.env.example` | `apps/worker/.env` | Heartbeat; future executor-only credentials. |
| `packages/database/.env.example` | `packages/database/.env` | Database migration connection. |
| `contracts/.env.example` | `contracts/.env` | Network-specific contract tooling. |

The root `.env.example` is an index, not a shared secret file. Configure each deployed
service independently. The owner key stays in the user's wallet; future delegated
agent credentials belong only to the executor runtime.

## Development network

Base Sepolia, chain ID **84532**, is the initial development network. MockUSD is a
six-decimal fixture and is not USDC. Confirm the organizers' acceptance of testnet
evidence before choosing the submission network.

## Next milestone

Implement and verify one permissioned Kernel transaction path: create an account,
authorize a restricted session, confirm an allowed transfer, reject an out-of-scope
action, and revoke the session. See `docs/roadmap.md` for the five-day sequence.

The revised target demo is **Astra as an AI Enterprise Node**, procuring a database
service from a provider agent with bounded micro-payments. These are design targets,
not scaffold capabilities. See [workflow and branches](docs/workflow.md),
[architecture](docs/architecture.md), [adversarial evaluation](docs/evaluation.md),
and the [five-minute demo script](docs/demo-script.md). Branch names in the workflow
are proposals, and all financial/security evidence remains pending.
