# Executor worker

Execution is disabled by default. `EXECUTION_ENABLED=true` requires an existing,
funded Kernel account with Guardian installed, a bounded session credential (and
owner enable authorization when needed), RPC/bundler and migrated PostgreSQL.
Local scheduling starts paused until the owner authenticates and starts it via API.

The worker uses account-scoped claims/fencing, current-state checks, exact signed
operation persistence before send, and keyed nonce/event/receipt reconciliation.
Uncertain operations are not blindly retried. The loop does not overlap ticks.
Models run in the API process; this runtime uses persisted plans and a deterministic
fallback. It never receives an owner key. See `../../docs/ab-handoff.md` for known
boundaries (one invoice/attempt, no automatic replacement/provisioning/cost claims).
