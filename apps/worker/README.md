# Executor worker

This process currently emits a heartbeat only. Transaction execution is disabled;
setting `EXECUTION_ENABLED=true` is rejected until an executor is implemented.

Next work: database task claiming, current-state validation, scoped Kernel signing,
receipt reconciliation, bounded retries, and idempotent recovery. Keep the owner's
key outside this process and restrict the agent's delegated authority on-chain.
