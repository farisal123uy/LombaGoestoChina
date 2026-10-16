# Contract acceptance tests

Implement tests against the actual account/module execution path:

- Allowed recipient, token, selector, and amount.
- Per-payment and cumulative limits, including concurrent operations.
- Protected-balance enforcement with otherwise-valid limits.
- Permission expiry and revocation.
- Batch, approval, and administrative-call bypass attempts.

No policy tests have been implemented yet. Compiling MockUSD is not proof of wallet
authorization, account abstraction integration, or protected-funds enforcement.
