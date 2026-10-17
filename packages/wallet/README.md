# Wallet integration

Implements Guardian ABI/typed quotes/payment IDs, policy snapshots and plan validation,
Kernel 0.3.1 owner/session helpers and an exact-operation execution/reconciliation
driver. Session signer authority is limited to Guardian executePayments and expiry,
with ERC-1271 disabled. Owner setup/enable signatures and nonce revocation are covered
by the local-fork test. The worker never accepts an owner private key.

Keep UserOperation hashes separate from transaction hashes. Receiving a submission
hash is not proof of successful execution. Confirm the final receipt and task outcome.
See `../../docs/ab-handoff.md` for setup, tested boundaries and remaining gas/batching work.
