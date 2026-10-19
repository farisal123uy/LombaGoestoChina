# Service Escrow Prototype — Provider Attestation and Timeout Refund

**Status:** verified in the reviewer fork and in one owner-authorized Base Sepolia escrow procurement. The pre-existing Kernel index-0 account remains direct mode; escrow uses its separately signed index-1 account.

**Contract:** `GuardianPayments`, a new `lockPayment` agent-permission selector.

**Verification:** contract and reviewer fork tests; public deployment, lock/release receipts and provider namespace activation recorded in `docs/evidence/public-escrow-deployment.json` and `docs/evidence/public-escrow-procurement.json`.

## Purpose

The current procurement flow settles the invoice first, then the provider provisions the service and signs a delivery receipt. A failed provider fulfillment therefore requires owner follow-up; settlement and delivery are not atomic.

This prototype explores a different sequence:

1. The restricted Kernel session locks one authenticated invoice amount into Guardian escrow.
2. The provider provisions the service and signs an EIP-712 delivery attestation.
3. Anyone may submit that attestation to release escrow to the quoted recipient.
4. If no valid provider attestation is submitted by the escrow deadline, anyone may return funds to the originating smart account.

The contract does **not** inspect a cloud database or prove service quality. The attestation signer is trusted to assert that service became ready. A service probe may be performed by the off-chain worker before the provider signs, but a signed provider receipt remains an oracle/trust assumption.

## Contract interface and lifecycle

- `lockPayment(quote, quoteSignature, expectedPolicyVersion, validUntil, refundAfter)` is callable through the explicitly scoped Kernel session selector. It accepts exactly one quote and checks the existing policy, recipient allowlist, EIP-712 quote signer, quote expiry, per-payment cap, UTC daily cap, replay ID and protected reserve. `refundAfter` must be in the future and no more than 24 hours away.
- Guardian moves exactly the quote amount from the smart account into its own token balance through `executeFromExecutor`. It records the payment ID as consumed, reserves daily spend, and creates a `Locked` escrow before the external token call; any failure reverts the transaction atomically.
- `releaseEscrow(paymentId, lockTransactionHash, readyAt, serviceExpiresAt, signature)` verifies a typed EIP-712 attestation from the quote signer. The attestation binds payment/account/invoice/service, lock transaction hash, ready time and service expiry. It must be submitted before the deadline, must attest readiness no earlier than lock time, and must describe a service period still active at release. The contract transfers tokens to the quoted provider recipient and changes status to `Released`.
- `refundEscrow(paymentId)` is permissionless after the deadline. It returns the locked tokens to the originating smart account and changes status to `Refunded`. If the refund occurs in the same UTC day as lock, that day's spend counter is decremented; the consumed invoice ID remains consumed, preventing replay. A new quote/invoice ID is required for another purchase attempt.
- `pendingEscrows(account)` prevents uninstalling Guardian while an escrow remains unresolved. Existing escrows can still be released/refunded when normal scheduling is paused or policy validity expires.
- In reviewer escrow mode, the provider namespace is created in a staged, non-readable state. The worker probes it through a dedicated internal route before submitting release; normal reads/writes are enabled only after the confirmed release event is verified.

Escrow statuses: `None → Locked → Released` or `None → Locked → Refunded`. Released/refunded escrows are terminal; there is no second payout path.

## Proof-of-concept test

From repository root, with Base Sepolia RPC reachability:

```powershell
$env:KERNEL_FORK_RPC_URL="https://sepolia.base.org"
npm.cmd run test:contracts
Remove-Item Env:\KERNEL_FORK_RPC_URL
```

`Escrow.integration.ts` deploys fresh contracts on an isolated fork and tests the contract lifecycle. `Review.integration.ts` tests the API/worker/provider lifecycle with model HTTP fixtures and a local fork. Together they verify:

- session can lock an authenticated quote and account reserve is preserved;
- escrow holds funds and provider balance remains unchanged while pending;
- an attestation signed by the wrong provider is rejected;
- the correct provider attestation releases funds once;
- refund before deadline is rejected;
- timeout refund restores funds and same-day budget;
- a refunded escrow cannot later be released.
- staged namespace probes are available only through the internal path before payout and normal service access requires confirmed release.

This test submits UserOperations and transactions only to the local fork. It does not alter public Base Sepolia state or the demo database.

## Reproduce the Base Sepolia owner demo

The owner setup supports an explicit `escrow` mode on a **new Kernel account index 1**. It does not overwrite or add selectors to the existing index-0 account. Deployment and session authorization require the owner to review and sign in MetaMask. The session permission includes the lock, release and refund selectors; the worker verifies all three before execution. Before Kernel installs a newly authorized session on its first UserOperation, the worker validates the stored owner signature against the exact escrow permission typed data. The reviewer flow remains isolated-fork-only.

Before beginning, confirm the database configured in `packages/database/.env` is the intended demo database and contains the current base schema. Migrations `0006` and `0007` add the durable escrow journal and staged-provider readiness fields. `npm.cmd run db:migrate` applies every pending migration to that configured database; do not point it at a production/demo database unless that migration is intended and backed up.

From PowerShell at the repository root, after stopping any running owner API/worker and checking the target database:

```powershell
npm.cmd run db:migrate
$env:SETTLEMENT_MODE = "escrow"
$env:ESCROW_WINDOW_SECONDS = "600"
npm.cmd run owner:setup
```

Open `http://localhost:3000/setup`, verify the banner says **escrow** and Kernel index **1**, connect the configured owner on Base Sepolia, then review/sign the sponsored deployment and the Astra session authorization. The setup deploys the escrow Guardian and a separate test token for that account. If setup reports `ONBOARDING_ESCROW_SCHEMA_REQUIRED`, stop and verify both migrations are present in the configured demo DB.

After runtime synchronization succeeds, stop the setup processes with Ctrl+C. Start runtime services in one terminal and the web dashboard in another:

```powershell
npm.cmd run runtime:dev
```

```powershell
npm.cmd run dev:web
```

`runtime:dev` refreshes provider-signer configuration from the new deployment and starts the API, worker and provider processes. In `/dashboard`, create and queue one authenticated catalog invoice, start the agent, and inspect the completed task. The dashboard links to the public Base Sepolia lock and release transactions. Use only testnet tokens and approved sponsored gas; never reuse the existing index-0 deployment for escrow. The worker fails closed if the migration, deployed escrow contract, provider signer or owner-authorized selectors are missing.

After a public escrow task completes, verify its canonical lock/release receipts and refresh the committed evidence artifact with `npm.cmd run wallet:escrow:verify -- --record`. This checks the EntryPoint operations, Guardian escrow events and final contract state; it also records provider receipt verification and staged namespace activation. The Evidence page labels this as public testnet MockUSD and retains the provider-attestation/oracle limitation.

After demos, return the owner runtime to direct mode by following the standard owner setup/runtime configuration for the desired account; do not edit the worker mode while an escrow is pending. A locked escrow must be released by provider attestation or refunded after its deadline. The provider-signed attestation remains an oracle assumption, not an on-chain proof of service quality. Public testnet activity changes Base Sepolia state and is distinct from local fork tests.
