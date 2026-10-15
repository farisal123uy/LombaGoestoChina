# Security self-assessment — implementation tracker

Status: **not assessed**. This document tracks implementation work and does not claim
an audit or resistance to attacks.

| Control | Scaffold status | Required evidence |
| --- | --- | --- |
| Owner authentication | Pending | Signature, nonce, expiry, and object-ownership tests. |
| Read / propose / execute permission tiers | Pending | Actual signer and account authorization tests. |
| Scoped destinations and selectors | Pending | Accepted and rejected operations on the real execution path. |
| Per-payment and cumulative limits | Pending | Boundary and concurrency tests. |
| Protected balance | Pending | Execution-time invariant and bypass tests. |
| Expiry and revocation | Pending | Later operations fail after access is revoked. |
| Gas and loop controls | Pending | Bounded retries, rate limits, and sponsor-budget behavior. |
| Prompt injection containment | Pending | A malicious proposed action cannot bypass authority. |
| Task idempotency and recovery | Pending | Retry/restart cases without duplicate payment. |

Signing, custody, and owner authentication have not been implemented. Placeholder
environment files contain no credentials. Model/planner runtimes must not receive
owner or agent signing keys.

Add concrete known risks, dependencies, trust boundaries, and test results as features
are implemented. Budget compliance alone does not prove a decision serves the user's
interests. A local worker pause is distinct from on-chain permission revocation.
