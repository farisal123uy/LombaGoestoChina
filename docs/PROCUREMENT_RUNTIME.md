# Procurement runtime

The local `/dashboard` workflow connects Astra, a separate Qwen-backed provider
agent, a deterministic signer, the restricted payment worker, and PostgreSQL service
delivery. Current verified stage: [progress checkpoint](PROGRESS.md).

## Start after completed owner setup

From the repository root, keep the existing web server running. If needed, start it
in its own terminal with `npm.cmd run dev:web` after building the shared packages.
In a separate terminal:

```powershell
npm.cmd run runtime:dev
```

This builds packages/API/worker, provisions local provider configuration, then runs:

| Process | Address / role | Credential scope |
| --- | --- | --- |
| Financial API | `127.0.0.1:4000` | Owner login, model access, privileged task DB; no signing key |
| Payment worker | Terminal heartbeat | Restricted session, bundler, task DB; no model |
| Provider agent | `127.0.0.1:4200` | Qwen, token to fixed-catalog signer; no signing key |
| Provider signer/service | `127.0.0.1:4201` | Provider key, RPC, service DB; no model |

`provider:configure` preserves service tokens and keys, synchronizes the worker with
the migration database, and configures the provider endpoints. Private files stay
under ignored `.local/` and service `.env` paths. It never changes the SQL scheduler
pause flag. Ctrl+C stops the financial runtime; web/onboarding can remain separate.
Provider entrypoints use compiled API files; restart `runtime:dev` after editing them.

## Owner workflow

1. Open **http://localhost:3000/dashboard** in the MetaMask browser. Select the owner
   used for `/setup`, then **Connect owner & sign in**. This is a new, domain-bound API
   login signature, not a new deployment signature. Sessions last 15 minutes.
2. Use the default 1 MB / 1 hour request and **Ask Astra & request provider quote**.
   Inspect the actual exchange, fixed **0.26 MockUSD** invoice and planned task.
3. Press **Start agent** promptly once the plan is ready. Plans last at most 120
   seconds. The worker revalidates policy and fees before signing/submitting; gas
   sponsorship remains subject to the configured project's acceptance.
4. Follow `planned → executing → paid → completed`. `paid` proves settlement only.
   `completed` additionally requires the provider delivery signature and independent
   database write/read probe. Inspect the public transaction link.
5. Use **Verify database probe**, then **Write & read back**. The namespace is an
   actual expiring PostgreSQL JSONB key/value service, not a dedicated cloud instance.
6. **Pause worker** stops new local scheduling. An existing operation still needs
   reconciliation; paid-task delivery retries can continue. On-chain pause/session
   revocation are separate owner controls.

If submission is `unknown`, inspect/reconcile that existing task. Do not create a
second procurement task to work around it. Delivery retries never repay the invoice;
after five failed attempts the confirmed payment remains recorded and task needs owner.
Expired unsubmitted plans can be replanned through the authenticated API's existing
`POST /v1/tasks/:id/replan`, using the same instruction and quote while still valid.

## Fixed demonstration catalog

| Offer | Capacity | Period from settlement | Price (6 decimals) |
| --- | --- | --- | --- |
| `database-small-1h` | 1 × 1,048,576 bytes | 1 hour | 260000 units = 0.26 MockUSD |
| `database-standard-4h` | 4 × 1,048,576 bytes | 4 hours | 520000 units = 0.52 MockUSD |

The signer binds account/request/offer identity and prices; model text cannot change
recipient, amount or authority. Namespace capacity and expiry are enforced by the
service store. Each value is at most 4096 characters; keys are validated. MockUSD is
a test token. Namespace expiry starts at confirmed settlement, not the later retry.

## Live preview without payment

With completed setup/configuration, an **empty queue** and **paused scheduler**:

```powershell
npm.cmd run provider:configure
npm.cmd run provider:check -- --temporary-runtime --record
```

The checker starts four temporary processes, observes a real idle worker heartbeat,
checks unauthenticated access refusal, obtains a fixed signed invoice, runs real local
buyer/provider/model planning and selected wait/jailbreak cases, then stops only its
children. Buyer inference runs in the preview CLI using the same planner code as API;
the API process's health/auth/configuration is checked without bypassing owner login.
The readiness invoice is reused idempotently by the provider request. Hosted invoice
SQL and public-chain policy reads are real; no payment task/UserOperation is created
and no service-delivery claim is made.

If the runtime is already running, omit `--temporary-runtime`; owner queue/pause
preconditions still apply. Sanitized output can be recorded to
[`evidence/provider-live-preview.json`](evidence/provider-live-preview.json).

## Evidence boundaries

- Public deployment: [`evidence/public-deployment.json`](evidence/public-deployment.json).
- Real Qwen + hosted invoice + signed quote preview: `provider-live-preview.json`.
- Integration tests: PGlite, cryptographic signatures and explicit chain/model fixtures.
- Browser tests: injected wallet/API fixtures; they do not broadcast.
- Kernel/fork tests: actual contracts on an isolated local chain fork.
- The first public procurement settled successfully and completed service checks:
  [`evidence/public-procurement.json`](evidence/public-procurement.json) and
  [AI-01 report](evidence/AI-01-public-procurement.md). The saved liveness check is
  time-stamped; the one-hour namespace expires normally after its rental period.

Verify an existing completed task using the current runtime:

```powershell
npm.cmd run wallet:procurement:verify -- --record
```

Optional `--task=<uuid>` selects an owned task; otherwise the most recent completed
procurement is selected. `--write-read` additionally writes/reads a new evidence-only
key while active. Existing application values are omitted from public evidence.
The verifier never submits a UserOperation or creates a payment task. An expired
namespace is explicitly labeled `expired_not_probed` without inventing fresh liveness.
