# Wallet integration

Implements Guardian ABI/typed quotes/payment IDs, policy snapshots and plan validation,
Kernel 0.3.1 owner/session helpers and an exact-operation execution/reconciliation
driver. The default session permits Guardian `executePayments`; opt-in escrow adds
only `lockPayment`, `releaseEscrow` and `refundEscrow`. Both use zero native call value,
expiry and disabled ERC-1271 authority. Owner setup/enable signatures and nonce revocation are covered
by the local-fork test. The worker never accepts an owner private key.

Keep UserOperation hashes separate from transaction hashes. Receiving a submission
hash is not proof of successful execution. Confirm the final receipt and task outcome.
See `../../docs/ab-handoff.md` for setup, `../../docs/BATCHING_AND_COST.md` for bounded
batching and `../../docs/ESCROW_PROTOTYPE.md` for the escrow path and trust boundaries.
