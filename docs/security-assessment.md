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
| Batch aggregation and atomicity | Pending | SEC-03: sum all items before calls; no partial effects; cross-UserOperation/UTC-boundary tests. |
| Reentrancy | Pending | SEC-05: callback and cross-entrypoint attacks against the actual account-scoped guard. |
| Approval / signature denial | Pending | SEC-06: approve/permit/Permit2/EIP-1271 routes denied, initial allowance checked, no protected-token gas pull. |
| Direct jailbreak / compromised planner | Pending | SEC-01: real model response separate from hostile JSON fixture; actual restricted route rejects it. |
| Vendor parsing isolation | Pending | SEC-02: tool-free parser, escaped tags, bounded fields, trusted quote binding, benign controls. |
| Inference-to-execution freshness | Pending | REL-01: policy/TTL/balance changes during inference and after simulation. |
| Unknown reconciliation | Pending | REL-02: persist-before-send, keyed nonce/hash/events, timeout/restart/reorg, one logical settlement. |
| Circuit breaker separation | Pending | SEC-07: local pause, confirmed contract pause and revoke; owner-only unpause, ordering of pending operations. |
| Provider/invoice integrity | Pending | AI-01/REL-03: quote origin and invoice binding, stable payment IDs, separate provisioning evidence. |

Signing, custody, and owner authentication have not been implemented. Placeholder
environment files contain no credentials. Model/planner runtimes must not receive
owner or agent signing keys.

Add concrete known risks, dependencies, trust boundaries, and test results as features
are implemented. Budget compliance alone does not prove a decision serves the user's
interests. A local worker pause is distinct from on-chain permission revocation.

## Revised control design and residual risks

- **Custody and scope:** the target Guardian action guards the smart account's token
  balance, not an unrelated helper balance. Pin the Kernel route, action, storage
  context and permitted execution mode. Other modules/sessions/old allowances must
  be inventoried. Owner compromise or deliberate owner withdrawal is outside the
  agent-path reserve promise.
- **Post-transfer invariant:** sum batch spending, reserve daily budget/IDs before
  calls, use CEI/SafeERC20/account-scoped nonReentrant, then assert protected balance
  and exact token outflow. All failed items roll back the whole batch; gas is not
  rolled back. Token support is restricted to verified standard-behavior ERC-20.
- **Limits:** daily means a UTC fixed window. A midnight burst is not prevented by
  claiming a rolling-24-hour limit. Policy/session updates cannot reset spent/IDs.
  Within-limit but unnecessary purchases are still a possible harm; measure intent
  alignment separately and enforce verified invoice/quote bindings.
- **External content:** tags and isolated parsing reduce exposure but are not a
  formal injection boundary. Test direct/indirect/encoded/multi-turn attacks and
  model-output fixtures; deterministic and contract authorization remain mandatory.
- **Availability and delivery:** pause-only guardians can deny service by pausing;
  only the owner unpauses. Cloud service delivery is not atomic with payment. Provider
  failure, RPC outages, key custody, SDK compatibility, and account upgrades remain
  dependencies to assess during implementation.
- **Economics:** sponsored gas still has a payer. Verify paymaster charge paths,
  absolute/relative fee budgets and bounded queues; testnet fees cannot establish
  mainnet $0.26 unit economics.

Detailed target design: [architecture](architecture.md). Acceptance matrix and model
vs enforcement evaluation: [evaluation](evaluation.md). No audit or attack-resistance
claim is made until implementation and evidence are reviewed.
