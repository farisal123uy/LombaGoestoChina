# Service Escrow Prototype — Provider Attestation and Timeout Refund

**Status:** isolated-fork proof of concept; not enabled by the owner API/worker or public deployment.

**Contract:** `GuardianPayments`, a new `lockPayment` agent-permission selector.

**Verification:** `contracts/test/Escrow.integration.ts` on a local Base Sepolia fork.

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

Escrow statuses: `None → Locked → Released` or `None → Locked → Refunded`. Released/refunded escrows are terminal; there is no second payout path.

## Proof-of-concept test

From repository root, with Base Sepolia RPC reachability:

```powershell
$env:KERNEL_FORK_RPC_URL="https://sepolia.base.org"
npm.cmd run test:contracts
Remove-Item Env:\KERNEL_FORK_RPC_URL
```

`Escrow.integration.ts` deploys a fresh Kernel, Guardian and MockUSD on an isolated fork and verifies:

- session can lock an authenticated quote and account reserve is preserved;
- escrow holds funds and provider balance remains unchanged while pending;
- an attestation signed by the wrong provider is rejected;
- the correct provider attestation releases funds once;
- refund before deadline is rejected;
- timeout refund restores funds and same-day budget;
- a refunded escrow cannot later be released.

This test submits UserOperations and transactions only to the local fork. It does not alter public Base Sepolia state or the demo database.

## Important rollout boundary

This prototype is **not integrated with** the API's queue, `PaymentWorker`, provider provisioning endpoint, task statuses or database escrow records. The existing runtime still uses direct `executePayments` settlement. The current public owner session was installed before this additional selector and does not automatically gain escrow permission. Fresh permission authorization explicitly includes the selector; existing deployed accounts would require a separately designed and owner-signed permission update.

Do not label the current reviewer/owner flow as escrow-enabled. Before any runtime rollout, add durable escrow state and reconciliation, provider provisioning/idempotency for escrow locks, clear `escrowed/released/refunded` task states, client/API release/refund handling, operational deadline monitoring, hosted tests, migration and review of same-day refund accounting. Obtain independent contract review before real-value use.
