# Contract acceptance tests

`GuardianPayments.ts`: implemented local account-harness invariant tests.
`Kernel.integration.ts`: opt-in actual Kernel 0.3.1/EntryPoint 0.7 fork integration,
including scoped session enable/payment/revoke, bypass rejection and SQL/worker
lost-response recovery. These are different evidence levels; neither is a public
testnet transaction. See `../../docs/ab-handoff.md` for execution instructions.

Implement tests against the actual account/module execution path:

- Allowed recipient, token, selector, and amount.
- Per-payment and cumulative limits, including concurrent operations.
- Protected-balance enforcement with otherwise-valid limits.
- Permission expiry and revocation.
- Batch, approval, and administrative-call bypass attempts.

Compilation alone is not proof of wallet authorization or policy enforcement.
Remaining acceptance targets must be distinguished from recorded passing cases.
