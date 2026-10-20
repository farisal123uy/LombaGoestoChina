# Executor worker

Execution is disabled by default. `EXECUTION_ENABLED=true` requires an existing,
funded Kernel account with Guardian installed, a bounded session credential (and
owner enable authorization when needed), RPC/bundler and migrated PostgreSQL.
Local scheduling starts paused until the owner authenticates and starts it via API.

The worker uses account-scoped claims/fencing, current-state checks, exact signed
operation persistence before send, and keyed nonce/event/receipt reconciliation.
Uncertain operations are not blindly retried. The loop does not overlap ticks.
Models run in the API process; this runtime uses persisted plans and a deterministic
baseline planner. It never receives an owner key. Direct mode supports bounded
1–10-invoice batches with a shared durable attempt; escrow mode requires one invoice
and separately journals release/refund operations. Paid services are fulfilled and
retried independently without another payment. See `../../docs/BATCHING_AND_COST.md`
and `../../docs/ESCROW_PROTOTYPE.md`. Automatic fee replacement and production
multi-process/pooler stress remain outside the verified scope.
