# Architecture

## Scaffold implemented

- `apps/web`: English-language project landing page and manual API health check.
- `apps/api`: process health and explicit pending-capability status.
- `apps/worker`: bounded heartbeat interval, execution disabled.
- `packages/shared`: draft interfaces and task statuses.
- `packages/planner`: interface and model SDK dependencies.
- `packages/wallet`: development public client and executor interface.
- `packages/database`: draft Drizzle schema and connection factory.
- `contracts`: local/testnet MockUSD and an Ignition deployment module.

## Intended execution path

```text
Owner -> Web -> Authenticated API / Planner -> PostgreSQL
              Owner wallet authorization         |
                                                v
                                          Executor worker
                                                |
                                                v
                                    Bundler -> EntryPoint -> Kernel
                                                              |
                                                              v
                                                  Scoped action / controls
                                                              |
                                                              v
                                               Receipt -> task reconciliation
```

These financial paths are not wired up yet. The planner proposes structured data;
deterministic code resolves trusted recipients, amounts, and current policy. The
executor holds only delegated signing authority. Owner-level policy changes require
the owner's wallet authorization.

Use string-encoded integer token units in JSON. Keep UserOperation hashes, transaction
hashes, receipts, and business task completion as distinct facts.

## Integration decisions still to prove

- Compatible SDK, Kernel, EntryPoint, and permission-plugin versions.
- Concrete execution-time protected-balance enforcement.
- Cumulative spending, gas sponsorship budgets, and revocation semantics.
- Authentication, database locking, and recovery behavior.
- Model ID, structured schemas, and evaluation fixtures.
