# Frontend collaboration handoff

Backend checkpoint: **`5088219`** on **`feat/wallet-agent-backend`**.
The branch includes the complete monorepo and working frontend reference, shared
schemas, API, worker, provider processes, tests and sanitized public evidence.
Current progress: [PROGRESS.md](PROGRESS.md).

Integration update: frontend `origin/feat/enterprise-dashboard` at **`4e47b13`** is
now ported into the local stage-two source with the assistant and reviewer flows.
See [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md). This is not a published merge;
the owner explicitly deferred GitHub commit/push.

Stage-two additive features (currently local `feat/batching-evaluation`): asset
overview, payment drafting/queuing and wallet-policy risk checks. Integration contract:
[WALLET_ASSISTANT.md](WALLET_ASSISTANT.md). The reference UI is isolated in
`apps/web/components/wallet-assistant.tsx`, mounted from `financial-dashboard.tsx`.
Preserve `draft` as non-executable and use shared `assistant.ts` types when merging
the new capability into a redesigned frontend.

The reviewer entry `/review` mounts `FinancialDashboard` with a scoped `reviewSession`
and same-origin `/api/review/sessions/<id>` prefix. Preserve the optional API base,
capability header on status/financial calls, no-MetaMask review path, expiry/close flow,
and explicit local-fork receipt labels. Do not turn a local hash into a public explorer
link. Model display uses the actual ID (candidate GPT-OSS 120B), not hard-coded Qwen.

## Get the code

For a fresh clone:

```sh
git clone --branch feat/wallet-agent-backend --single-branch https://github.com/farisal123uy/LombaGoestoChina.git
```

Open the cloned repository folder; `package.json`, `apps/` and `packages/` are at
its root. For an existing clone with your current work saved on its own branch:

```sh
git fetch origin
git switch --track origin/feat/wallet-agent-backend
```

Create frontend work from this backend checkpoint:

```sh
git switch -c feat/enterprise-dashboard
```

The uploaded `main` history currently has a different root from the implementation
branch. Branch from this feature checkpoint for compatible frontend changes;
integration into `main` is a separate history-alignment task.
For current frontend reviews, target `feat/wallet-agent-backend` as the PR base so
the frontend and backend changes share this implementation history.

## Start the frontend

Requires Node **>=22.13** and npm **10**. From the monorepo root:

```sh
npm ci
npm run build:packages
npm run dev:web
```

On PowerShell, use `npm.cmd` if execution policy blocks `npm`.
Open **http://localhost:3000/dashboard** or **http://localhost:3000/setup**.

## Integration references

| Path | Purpose |
| --- | --- |
| `apps/web/components/financial-dashboard.tsx` | Existing owner login, goal/quote/plan, Start/Pause, task/transaction/service UI |
| `apps/web/components/owner-setup.tsx` | MetaMask deployment/session onboarding reference |
| `apps/web/lib/wallet.ts` | EIP-1193 wallet helpers, Base Sepolia switch and display units |
| `packages/shared/src/payments.ts` | `PaymentTask`, `PaymentAttempt`, `PolicySnapshot`, quote/plan/status definitions |
| `packages/shared/src/services.ts` | Procurement, fixed catalog, delivery/probe/KV schemas |
| `docs/ab-handoff.md` | Detailed API methods, request/response shapes and auth contract |
| `tests/e2e/dashboard.spec.ts`, `owner-setup.spec.ts` | Explicit wallet/API fixtures for frontend workflow tests |
| `docs/evidence/AI-01-public-procurement.md` | Actual public payment/service evidence; distinct from fixtures |

Import browser-facing types from `@guardian-wallet/shared`. Amounts are integer
base-unit **strings**, timestamps are Unix seconds and chain ID is **84532**.
Task `paid` is settlement; `completed` additionally requires verified service delivery.
Keep model summaries as rendered text and keep fixture data visibly separate from
real balances, transaction links and service results.

## Connecting live data

Web public configuration is in `apps/web/.env.example`; copy the necessary endpoint
settings into ignored `apps/web/.env.local`. Default API is `http://localhost:4000`.
`NEXT_PUBLIC_ONBOARDING_URL` is the separate local owner coordinator on port 4100.

**A colleague's localhost is not the backend owner's computer.** A live integration
across computers needs an agreed reachable backend URL and API `WEB_ORIGIN` matching
the frontend's origin. Hosting is still a separate milestone; pushing code does not
publish the running API or the local Ollama model.

Public `/health` and `/v1/status` require no login. Financial endpoints require:

1. `POST /auth/nonce` for the configured owner address.
2. MetaMask `personal_sign` of the exact returned message.
3. `POST /auth/verify` with address/nonce/signature.
4. `Authorization: Bearer <token>` for subsequent owner API calls.

Sessions are in memory, last 15 minutes and expire on API restart. A different wallet
is not automatically authorized. The existing Playwright fixtures support frontend
development before arranging an actual owner-signed integration session.

Backend DB credentials, bundler tokens, worker/session keys, provider signer keys and
the private `.local/` journal remain with their respective runtimes. They are not
frontend configuration and are not part of the GitHub snapshot.

## Checks and coordination

```sh
npm run lint
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Coordinate changes to shared schemas, API routes and root `package-lock.json` with
the backend owner. UI/UX work can build on the existing components while preserving
owner authentication, explicit execution controls and the `paid`/`completed` distinction.
