# Sponsored owner onboarding

Current branch: `feat/wallet-agent-backend`. This is a **local owner setup tool** for
public Base Sepolia deployment. Project sponsorship quota/pricing is determined by
ZeroDev; an available quote is not a pricing or final-inclusion guarantee.

## Verified prerequisites

- Owner: `0x4217fb05408bfaBF9ed9d70f78bA13E07C94d634`, currently no native ETH needed
  for an operation that the paymaster accepts and sponsors.
- Project bundler supports EntryPoint 0.7. Sponsorship policy is enabled and a
  bootstrap quote for actual contract deployment/install was obtained without an
  owner signature, transaction submission or requested quota consumption.
- Base Sepolia CREATE2 proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C` is deployed.
- Supabase migrations/RLS and local Qwen configuration are ready for the subsequent
  financial runtime. They are not needed for the local signing coordinator itself.

## Start from VS Code (repository root)

Single-terminal startup when no web server is already running:

```powershell
npm.cmd run owner:setup
```

This builds the dependencies/coordinator/contracts, then runs web + local coordinator
together. Ctrl+C stops the setup processes. The separate-terminal commands below are
useful when the web server is already running.

Terminal 1, web:

```powershell
npm.cmd run build:packages
npm.cmd run dev:web
```

Terminal 2, local owner coordinator:

```powershell
npm.cmd run onboarding
```

Open **http://localhost:3000/setup** in the browser where MetaMask is installed.
Coordinator listens only on **127.0.0.1:4100** and permits the configured local web
origin. Its bearer sessions are held only in browser memory and expire after 15
minutes. Sign in again after reload/expiry; deployment state remains in the journal.

## Owner actions

1. **Connect MetaMask & sign in**: select the configured owner. The page switches to
   Base Sepolia and asks for the domain/chain-bound API login signature.
2. **Prepare deployment**: reviews the owner/account/contract/session/recipient
   addresses, planned limits, expiry and native gas upper bound. This step can reserve
   project sponsorship quota while obtaining final paymaster data.
3. **Sign & submit deployment**: MetaMask signs the exact UserOperation hash with
   personal_sign. This is distinct from the login signature. The coordinator verifies
   owner recovery, current intent/nonce/factory binding, approved paymaster and gas
   budget, persists the exact signed payload before sending, then reconciles it.
4. Wait for **confirmed** and the explorer link. The coordinator checks EntryPoint
   success, canonical block/confirmation threshold and actual installed policy.
   An outer bundler transaction alone is not sufficient.
5. **Authorize Astra session**: MetaMask signs Kernel EIP-712 permission data for the
   displayed session address/expiry. The coordinator recomputes/verifies that exact
   permission and synchronizes runtime configuration. If synchronization fails, use
   **Retry runtime synchronization**; a saved authorization is not automatically a
   successfully synchronized runtime.

No owner private key is requested or exported. Owner signatures are protocol
requirements. A backend login or a chat claim of ownership never substitutes for them.

## What the single bootstrap operation does

- Kernel 0.3.1 is created by its factory through EntryPoint 0.7 if not already present.
- GuardianPayments is deployed through the canonical CREATE2 proxy. Its exact init
  bytecode determines the address; it stores per-account policy/accounting.
- GuardianDemoToken mints exactly **10 MockUSD** (6 decimals) to Kernel. It is a fixed
  supply test fixture, not USDC, not redeemable dollars.
- Guardian is installed as Kernel's ERC-7579 executor with reserve **6**, per-payment
  **1**, UTC-day **2**, provider-recipient allowlist and the displayed expiry.

The session only permits Guardian executePayments, zero native value and its timestamp
window; ERC-1271 signing is disabled for it. Owner controls policy, pause and revocation.
Existing mismatched/paused policy is not silently overwritten. The local initial
authorization window is seven days; renewal after expiry requires owner review.

## Local storage and credential scope

- `.local/onboarding/configuration.json`: stable public actor addresses and artifact
  hashes. Existing mismatches stop startup for review instead of regenerating keys.
- `.local/onboarding/operations.json`: private exact payload/signature journal.
  Duplicate submissions do not resend. Uncertain submissions must be reconciled
  before preparing a new operation. Do not remove this journal to work around unknown.
- `apps/worker/.env`: restricted session credential, later enable signature and
  sponsored execution configuration. This credential is never sent to the browser.
- `.local/provider-signing.env`: separate provider fixture signer; model/API planning
   runtime does not receive its private key. The provider signer service uses this
   identity through its own process boundary.

The provisioning tool creates session/provider keys if absent and preserves existing
valid bindings. It does not create an owner key. All private targets are Git-ignored;
`.local` and runtime env files are excluded from Docker context.

After successful session authorization, `.local/onboarding/deployment.json` records
public deployment settings. API/worker env files are updated, worker execution is
configured with a pinned paymaster and no native fallback. Local scheduling remains
paused in SQL until the authenticated owner starts the agent.

Start/restart API/worker and the separate provider processes after synchronization:

```powershell
npm.cmd run runtime:dev
```

Keep web in its existing terminal or use `npm.cmd run dev:web`. Open `/dashboard`,
sign in again for the financial API, request the small service and explicitly start
the agent. [Procurement Runtime](PROCUREMENT_RUNTIME.md) describes the full flow.
The setup coordinator can remain running for reconciliation.

## Sponsorship and accounting

The worker persists factory/paymaster hash-bearing fields exactly, counts paymaster
verification/post-op gas in its exposure cap, rejects unapproved/missing paymasters,
and never silently falls back to native fees. Sponsorship middleware does not request
ERC-20 gas payment or create token approvals. The actual fee payer is the project
paymaster, not a credit into the owner MetaMask balance.

OP execution RPCs may require tiny native fee balance even for eth_call. Sponsored
token preflight supplies native balance only in the simulation; it changes neither
token state nor chain state, is not submitted, and does not imply real native funds.
AA execution and paymaster verification remain the actual gas authorization path.

## Evidence and tests

- `SponsoredBootstrap.integration.ts`: actual Kernel/EntryPoint on an isolated fork,
  local fixture paymaster deposit + stub bundler. Owner/Kernel ETH remain **0**, while
  bootstrap deploys/installs policy and a scoped session pays **0.26 MockUSD**. Lost
  send response recovers across coordinator restart without a duplicate send.
- The fixture paymaster is **not** production eligibility/security evidence for
  ZeroDev; it is never deployed by the public bootstrap.
- Browser tests use an explicitly stubbed wallet/coordinator. They cover visible
  flow, wrong-owner refusal and usable offline instructions; actual signatures and
  AA execution are covered by the fork test.
- The configured owner completed the actual MetaMask signatures and public
  deployment: [`evidence/public-deployment.json`](evidence/public-deployment.json).
  This proves bootstrap, not the subsequent procurement payment/service outcome.

This coordinator is single-owner/local-process tooling, not a public multi-instance
onboarding backend. Hosted production onboarding requires durable shared storage,
operator credential isolation and deployment-specific origin/auth configuration.
