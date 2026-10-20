# A+B implementation and frontend handoff

Historical implementation snapshot: October 17, 2026. Work branch at that checkpoint:
**`feat/wallet-agent-backend`**, based on scaffold commit `6cd497e`.

Current stage two is integrated into `main`. This document preserves the original
direct-settlement API handoff and its historical counts/limitations. Current model,
batching, assistant and escrow behavior is documented in [technical documentation](technical-documentation.md),
[WALLET_ASSISTANT.md](WALLET_ASSISTANT.md), [BATCHING_AND_COST.md](BATCHING_AND_COST.md),
[ESCROW_PROTOTYPE.md](ESCROW_PROTOTYPE.md) and [PROGRESS.md](PROGRESS.md).

## Ownership

- **Project owner (A+B):** Kernel/session integration, Guardian Solidity, contract
  tests/deployment, shared schemas, owner API, bounded planner, PostgreSQL queue,
  executor and reconciliation/evaluation.
- **Teammate (C):** dashboard/wallet UX, product validation, demo presentation,
  English video/slides and submission assembly. Use the API/schema below as the
   integration contract. Owner setup and procurement dashboard are now implemented;
   current verification/remaining work is recorded in [PROGRESS.md](PROGRESS.md).

## Implemented vertical slice

Sponsored owner onboarding is now available at `/setup`, backed by the loopback
coordinator on port 4100. Use `npm.cmd run owner:setup`; see
[Sponsored Setup](SPONSORED_SETUP.md). Actual owner-signed public bootstrap succeeded:
[public manifest](evidence/public-deployment.json). The separate fork test verifies
zero-native-balance bootstrap and a scoped sponsored session payment.

```text
Owner wallet -> nonce/signature -> short-lived API bearer session
Signed provider invoice + user goal -> API planner -> durable payment task/plan
Owner starts local scheduler -> account claim/fence -> fresh validation -> simulate
  -> exact signed operation/hash persisted -> send to bundler
       | accepted                | response lost / crash
       v                         v
    submitted                 unknown
       `-------------------------+-> reconcile keyed nonce + EntryPoint event
                                     + Guardian settlement + consumed invoice ID
                                             |
                                        paid / needs_owner / needs_review
```

`paid` is token settlement, not proof that a cloud service was delivered. The worker
sets `completed` only after verified signed delivery and an independent PostgreSQL
write/read probe. Delivery retry/escalation does not repay a confirmed invoice.
The test service is an expiring JSONB key/value namespace, not a dedicated instance.

### Wallet/security

- Kernel **0.3.1**, EntryPoint **0.7**, CallPolicy **0.0.4**, SDK versions in the lockfile.
- Guardian is an **ERC-7579 executor module**, not a separate asset vault. Token funds
  stay in the smart account. Guardian calls `executeFromExecutor` in SINGLE/CALL,
  DEFAULT/revert mode, checking token return values with SafeERC20 semantics.
- The agent permission permits only calls to Guardian's `executePayments` selector,
  zero native transfer value, and a timestamp window. It denies ERC-1271 signature
  authority using the permission-level SKIP_SIGNATURE flag. Owner/configuration
  selectors and token approval/direct transfer are outside that session.
- EIP-712 provider quotes bind chain/module domain, account, provider/invoice, service
  hash, token, recipient, integer amount and expiry. A quote signer is a registered
  EOA in this phase. Provider private keys belong in a separate signing service,
  never in the browser or the model's tools/prompt.
- Pre/post account balance invariant, per-invoice cap, UTC-day cumulative cap, bounded
  atomic batches <= 10, CEI/reentrancy guard and permanent consumed payment IDs.
- Owner configuration increments policy version without clearing spending or IDs.
  Recipient membership is versioned. Uninstall/reinstall preserves accounting and
  leaves the module paused until the account explicitly unpauses it.
- A pause-only guardian can pause but cannot unpause. Owner revocation helper uses
  `invalidateNonce(currentNonce + 1)`, invalidating all existing non-root sessions.
  Owner authorization itself stays outside the worker.

### Agent/backend

- Native Ollama Qwen structured-output adapter (`createQwenPlanner`), isolated
  tool-free parser and an explicitly configured deterministic baseline. Local model
  `qwen3:8b` has a recorded four-case live smoke evaluation. A separate provider
  preview also passed: [provider evidence](evidence/provider-live-preview.json).
  Broader evaluation remains outstanding. No cloud model API key is required locally.
- Models return only a decision/summary. Quote amount, destination and policy fields
  are built by deterministic code; forged extra financial fields fail the schema.
- The live planner runs in the API process. The worker uses persisted plans and a
  deterministic baseline fallback, never an LLM alongside its signing credential.
- PostgreSQL migration and SQL-backed tasks, account leases/fencing, one active
  attempt per account, separate task/operation states and atomic terminal updates.
  The hosted Supabase database is connected with migrations through `0003`. All nine
  internal tables have RLS enabled with no public-role policies; server DB access
  uses its privileged connection and the authenticated owner API.
- Login proves control of the configured EOA owner (custom domain/chain-bound EIP-191
  challenge, not a claim of full SIWE/multitenant support). Nonces are one-use and
  expire in five minutes; bearer sessions last 15 minutes. Sessions are in memory
  per API instance and restart requires sign-in again.
- Worker default is execution-disabled. Even with execution configured, local
  scheduling is initially paused until authenticated `/agent/start`.
- Lost response, crash or unresolved nonce never causes a new-nonce retry. Existing
  attempts take precedence over queued tasks even while locally paused. Receipt
  checks match UserOperation success, actual chain receipt, block hash/confirmations,
  Guardian events and consumed IDs; unmatched/old evidence requires review.

## API contract for C

All financial endpoints require configuration. Except health/status/auth, send
`Authorization: Bearer <token>`. Token authentication does not grant on-chain owner
authority. Current runtime supports one configured owner/account on Base Sepolia.

| Method/path | Input | Output / behavior |
| --- | --- | --- |
| `GET /health` | None | Process health, independent of wallet execution. |
| `GET /v1/status` | None | Configuration state, local scheduling flag, implementation capabilities. |
| `POST /auth/nonce` | `{address}` | `{nonce,message,expiresAt}`; sign the exact message in owner wallet. |
| `POST /auth/verify` | `{address,nonce,signature}` | `{token,expiresInSeconds}`. |
| `GET /v1/policy` | Bearer | `{policy}` from one current on-chain block. |
| `POST /v1/plans` | `{instruction,quote}` | `{previewOnly:true,status,plan? or reason}`; never enqueues payment. |
| `POST /v1/tasks` | `{instruction,quote}` | `{task}`; 201 new, 200 existing invoice. API creates a bounded plan. |
| `GET /v1/tasks` | Bearer | `{tasks}` (latest 100 owned tasks). |
| `GET /v1/tasks/:id` | UUID | `{task,operation}`; no private signed operation payload. |
| `POST /v1/tasks/:id/replan` | `{instruction,quote}` for same payment ID | Replans only before any attempt exists and while not leased; 409 if busy/submitted. |
| `POST /agent/start` | Bearer | `{locallyPaused:false,onchainAuthorityChanged:false}`. |
| `POST /agent/pause` | Bearer | Stops new local sends; does not cancel pending operations or revoke signer. |
| `GET /v1/provider/catalog` | Bearer | Fixed demonstration service offers. |
| `POST /v1/procure` | `{requestId,instruction}` | Buyer intent → provider AI → verified invoice → durable bounded plan; request ID is idempotent. |
| `POST /v1/tasks/:id/probe` | Owned completed task | Fresh provider database write/read probe. |
| `GET /v1/tasks/:id/database` | Owned completed task | Namespace key/value data. |
| `PUT /v1/tasks/:id/database` | `{key,value}` | Capacity/expiry-limited namespace write. |

Quotes and plans use `packages/shared/src/payments.ts`. Amounts, counters, policy
versions and block numbers are decimal **strings**, not floating-point token values.
Quote IDs/service hash are bytes32, addresses are `0x` addresses, `validUntil` is Unix
seconds, and signature is a 65-byte EIP-712 EOA signature. Quote fields:

```text
account, providerId, invoiceId, serviceHash, token, recipient,
amountUnits, validUntil, signature
```

Invalid inputs return 400, authentication 401/403, missing owned task 404, busy replan
409 and unconfigured financial service 503. `error` is a machine-readable code;
`reason` is explanatory, not execution authority. Render model text safely as text.

### Owner wallet setup boundary

Helpers exported from `@guardian-wallet/wallet`:

1. `createOwnerKernel(publicClient, ownerWalletSigner, initConfig, index)` prepares
   the owner account. `encodeGuardianInstall(guardianAddress, policyData)` can be
   included in initConfig or sent by the already-deployed account's owner route.
   `encodeGuardianPolicyData(rules, recipients)` ABI-encodes `(PolicyInput,address[])`
   in Solidity field order; configuration amounts are bigint base units.
2. `getGuardianSessionAuthorization(client, accountAddress, ownerAddress,
   sessionAddress, guardianAddress, validUntil)` prepares permission ID/typed data
   using only public addresses. Do this after the account exists. The owner wallet
   signs this **specific permission**. The worker receives the resulting enable
   signature, not the owner's private key.
3. `createAgentKernel(..., enableSignature?)` enables that permission on its first
   operation or uses an already-installed permission. Keep the exact same session
   address, Guardian address and expiry when reconstructing it.
4. Policy changes / `setPaused(account,true|false)` are calls from the account owner
   route. Pause-only guardian calls can only set `true`. Display local pause,
   confirmed contract pause and session revocation as separate actions.
5. `encodeRevokeSessions(currentNonce)` returns the account-wide non-root nonce
   invalidation call. Only the owner route can execute it. This also prevents reusing
   an old owner enable signature after nonce invalidation; issuing a new permission
   requires a new owner authorization.

The fork test demonstrates the exact setup/sign/enable/revoke sequence. The module
must be installed through Kernel; calling `onInstall` from an EOA fails. Start with
a fresh zero-allowance account; token reserve protection covers enabled agent paths,
not owner withdrawals, old allowances or other independently authorized modules.

## Run and deploy

From repository root (PowerShell):

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:contracts
npm.cmd run test:integration
$env:KERNEL_FORK_RPC_URL="https://sepolia.base.org"
npm.cmd run test:kernel
npm.cmd run build
```

Unit/integration suites run without credentials or a hosted DB. Integration SQL runs
on the PGlite PostgreSQL engine with chain fixtures. The opt-in fork test uses the
actual deployed Kernel/EntryPoint on a local fork at block **48189742**, plus PGlite
and a local test bundler with static gas estimates. It does not send public-chain
transactions. Hardhat config pins Isthmus execution semantics for that test block;
this is not a historical-fork/production-fee simulation. The fork suite is skipped
in ordinary contract runs unless the RPC variable is set; `test:kernel` requires it.

For a configured runtime:

1. Set database migration `DATABASE_URL` in `packages/database/.env` and apply
   `npm.cmd run db:migrate`. The configured hosted database has migrations `0000`–`0003`;
   a fresh deployment still requires applying them.
2. Configure `apps/api/.env` with the owner/account/module addresses and RPC. Include
   `AI_PROVIDER=ollama`, endpoint/model ID for Qwen, or explicitly select
   `AI_PROVIDER=baseline`. A local endpoint must be made reachable through a protected
   model service when the API runs on a different host.
3. Configure `apps/worker/.env` with the same account/module, restricted session
   credential and expiry, bundler RPC, confirmations and gas cap. An owner-signed
   enable signature is optional if permission is already installed. Fund native gas
   separately in native mode, or select sponsored mode with a pinned approved
   paymaster. ERC-20/protected-token gas charging remains unsupported.
4. Keep web running, then use `npm.cmd run runtime:dev` for API/worker/provider
   processes. Authenticate at `/dashboard` and explicitly start local scheduling.
   See [Procurement Runtime](PROCUREMENT_RUNTIME.md).

Guardian deployment tooling (separate from enabling a wallet session):

```powershell
npx.cmd hardhat keystore set DEPLOYER_PRIVATE_KEY
npm.cmd run deploy:guardian -- --network baseSepolia
```

Run those deployment commands with **`contracts/` as the working directory**, using
a funded deployment-only credential and `BASE_SEPOLIA_RPC_URL`. This deploys Guardian;
it does not deploy/authorize a Kernel account, issue provider quotes or fund MockUSD.
Ignition records actual deployment receipts. The current public deployment instead
used the owner-signed sponsored bootstrap documented above. Keep owner signing in
the wallet and deployment/session credentials in their separate runtimes.

## Remaining work before a competition-ready demo

- Human validation and broader model evaluation/benchmark against the baseline.
  First public procurement/delivery passed: [AI-01](evidence/AI-01-public-procurement.md).
- Hosted PostgreSQL multi-process/pooler stress verification and durable multi-instance auth;
  connection/migration/RLS are already verified on Supabase.
- One logical invoice per worker operation in this slice. Contract/SDK support atomic
  batches; invoice-queue aggregation, relative fee gates and COST-01 measurements are
  still to implement. MAX_GAS_COST_WEI is an off-chain native ERC-4337 upper bound,
  not a cumulative on-chain gas budget or all-in L1-data/USD cost control.
- Retry/replacement after a confirmed failed attempt and operator resolution of
  needs_review are deliberately not automated here. An existing attempt blocks replan
  and automatic resending; read-only reconciliation continues. Confirmed paid tasks
  must not be repaid for a failed provisioning request.
- More adversarial corpus/reorg/expiry/bypass coverage, independent review,
   accepted-network procurement evidence and final video/slides.
- Dependency audit findings/mitigations and residual risks in
  [security assessment](security-assessment.md). Passing local tests is not an audit.
