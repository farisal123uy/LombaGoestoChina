# Guardian Wallet — technical documentation

International Track, Topic F: Agent Wallet. Current source is the local
`feat/batching-evaluation` working tree, not a frozen/published final revision.

## Purpose and implemented scope

Astra delegates a bounded financial task: procure a provider-managed database test
namespace, authenticate its invoice, settle within an owner's on-chain policy, then
verify delivery and a real database probe. The wallet assistant also exposes asset
overview, payment planning/queue release and deterministic operational risk checks.
Payment asset and network are configured; the public example uses MockUSD on Base
Sepolia. MockUSD is not USDC or a USD-price claim.

The chosen cloud interface is Groq Free with candidate GPT-OSS 120B and comparator
20B. Actual model, provider and output origin are recorded in plans. Live Groq quality,
latency, Linux production and public-browser workflow evidence is now recorded;
historical local Qwen results are kept separate. The transport has strict JSON plus Zod validation,
bounded input/completion tokens and queues, explicit quota errors and no model fallback.

## Components and authority boundaries

| Component | Responsibility and authority |
| --- | --- |
| Next.js frontend | Owner setup/dashboard and disposable reviewer entry point; no service/signing secrets |
| Authenticated Fastify API | Wallet state, quote validation, model planning, tasks and policy-risk views |
| Planner/model | Typed intent or pay/wait/needs-owner decision; no tools, raw calldata, price/recipient override or signer |
| PostgreSQL / PGlite | Durable task/operation state, leases/fencing, invoice idempotency, provider namespaces |
| Worker | Fresh validation, restricted-session signing, persist-before-send and receipt reconciliation |
| Kernel / EntryPoint / Guardian | Smart-account authorization and atomic on-chain policy enforcement |
| Provider agent | Offer decision through a model; no signing key |
| Provider signer/service | Fixed catalog EIP-712 quote, settlement verification, signed delivery and actual expiring KV namespace |

The owner authorizes deployment/session and policy administration separately. The
agent permission allows only Guardian `executePayments`, with native value zero and
expiry. It excludes arbitrary transfer/approval, admin, generic batch/delegatecall and
arbitrary message signatures. Reserve protection applies to the enabled agent route;
owner-authorized withdrawals/other modules are separate trust boundaries.

## Core algorithms

### Planning and budget

The API verifies account/token/chain/quote signature bindings. The bounded planner
checks policy installation, pause, time window, per-invoice amount, UTC-day cumulative
spend and protected reserve. The model supplies a constrained decision and a short
summary. Recipient, token, amount and signature stay bound to the authenticated invoice.
State is read again after inference and revalidated before signing and in the contract.

The overview computes:

```text
available = max(0, min(balance - protected reserve, daily cap - spent)
                   - queued commitments)
```

Amounts use integer base-unit strings and token metadata; no floating-point payment
arithmetic. Native gas and protected token amounts are separate. Pending operations
are reserved conservatively and may already affect the observed chain balance.

### Draft, queue and batch

Assistant procurement stores a non-executable `draft`. A reviewed release checks the
selected IDs again, resolves owner/account membership and existing attempts, then
locks the account and recalculates commitments inside a DB transaction. It queues
the complete eligible group or fails; it never silently clears pause or grants owner
permission. The scheduler deterministically groups 1–10 compatible approved invoices
inside a bounded window and keeps the earliest deadline. It does not widen authority.

### Atomic settlement

Guardian validates every signed invoice and recipient, marks payment IDs consumed and
debits the batch sum before external token calls. Daily cap and pre-transfer reserve
are checked on-chain; a non-reentrant ERC-7579 execution transfers directly from the
account. Return semantics, post-transfer reserve and exact outflow are checked. Any
failure reverts the whole batch and its counters/IDs. Standard-behavior ERC-20 only.

### Recovery and delivery

The worker persists exact signed payload/hash, keyed nonce, policy and batch membership
before send. Unknown outcomes are reconciled through bundler/EntryPoint events,
canonical receipt, settlement events and consumed IDs. An uncertain attempt does not
authorize a fresh nonce payment. Conflicts pause scheduling for review.

`paid` requires confirmed matching settlement. `completed` additionally requires a
bound provider delivery signature and authenticated fresh service probe. Provider
delivery retries do not repay an invoice. Repeated failure becomes owner attention
while preserving payment evidence. The database rental starts at settlement and expires.

### Isolated service-escrow proof of concept

`GuardianPayments` additionally has an experimental `lockPayment` path: one authenticated
quote is moved from the smart account into the module, then a quote-signer EIP-712
delivery attestation releases it to the provider, or any caller can return it to the
account after a deadline of at most 24 hours. Pending escrow prevents module uninstall;
a same-day refund frees that day's budget but keeps the invoice ID consumed. This path is
tested only in `contracts/test/Escrow.integration.ts` on a local fork. It is not wired to
the production API, worker fulfillment flow, task states or current public session; the
provider signature is a trust assumption, not an on-chain service-quality oracle. See
[escrow prototype notes](ESCROW_PROTOTYPE.md) before describing it as a capability.

## Reviewer execution environment

The `/review` flow provisions a disposable owner/account, policy and PGlite database
on an isolated fork. A short-lived capability grants access only to that workspace's
financial routes. The frontend displays local-fork execution explicitly and does not
link local hashes to a public explorer. The separate historical public AI-01 receipt
is linked for independently inspectable execution evidence.

The review container is prepared to run cloud inference calls and the fork on an
independently hosted server; no judge-side model or personal funds are needed. Cloud deployment,
eligibility/resource limits and China-network verification are distinct release gates.
Details: [REVIEW_DEPLOYMENT.md](REVIEW_DEPLOYMENT.md).

## Evidence and reproduction

- Public procurement: [AI-01](evidence/AI-01-public-procurement.md).
- Local/fork batching cost measurement: [COST-01](evidence/COST-01-local-batching.md).
- Actual reviewer contract/service execution with explicit model HTTP fixtures:
  `evidence/reviewer-workspace-fork.json`.
- Historical local Qwen baseline/selected regressions: evidence files label the model,
  fixture type and limitations. They do not prove GPT-OSS accuracy or injection immunity.
- Live Groq smoke/comparison reports are created only after real calls succeed.

Run from the source root:

```powershell
npm.cmd ci
npm.cmd run test:integration
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
$env:KERNEL_FORK_RPC_URL="https://sepolia.base.org"
npm.cmd run test:contracts
```

For cloud configuration, evaluation and deployment, follow [AI_CLOUD.md](AI_CLOUD.md)
and [REVIEW_DEPLOYMENT.md](REVIEW_DEPLOYMENT.md). Model/hosting accounts remain Free
without billing activation. No paid-service or public transaction step is required
for the local/fork suites above.
