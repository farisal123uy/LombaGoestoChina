# Implementation workflow and branches

## Current implementation ownership

Active branch: **`feat/wallet-agent-backend`**. The project owner implements roles A+B;
the teammate owns C (product/frontend/demo/submission). The original branch table below
is a work-breakdown proposal. See [A+B handoff](ab-handoff.md) for the implemented
wallet/backend slice, API contract, local-fork evidence and remaining work.

Status: **planned**, October 16, 2026. These names describe intended work; no Git
branches, commits, releases, or passing financial tests are created by this document.
The current repository contains the scaffold described in [architecture](architecture.md).

## Product flow and decision branches

```text
Owner signs registry, policy, session -> on-chain authority
Task -> Astra -> provider agent -> verified quote -> structured plan
                                                    |
                    invalid schema/quote/authority -+-> rejected / needs_owner
                    expired/changed policy ---------+-> stale -> replanning
                    fee too high / batch not ready -+-> waiting_fee / waiting_batch
                    ready --------------------------+-> claim + fresh state + simulate
                                                                          |
                                             persist signed attempt -> submit
                                                    /            |           \
                                                 reject       receipt      timeout
                                                    |            |            |
                                             failed/rejected     |          unknown
                                                                 |            |
                                                                 +<- reconcile
                                                                 |
                                                  UserOperation success + payment events
                                                                 |
                                                       paid -> service receipt/probe
                                                                 |
                                                   completed / service_pending
```

- A chat assertion of ownership cannot change authority; owner policy updates require
  wallet authorization. Both direct user input and external model data can be malicious.
- `unknown` blocks resending for the same logical payment until reconciliation. Local
  pause allows read-only reconciliation; on-chain pause and session revocation are
  separate controls, effective in chain execution order.
- Plans may become stale during inference, queueing, simulation, or inclusion. Recheck
  after inference and before signing; the contract enforces invariants at execution.
- Task and operation statuses are separate target state machines. The scaffold's shared
  status enum does not implement this flow yet.

## Folder responsibilities (target modules)

| Boundary | Intended modules | Owner |
| --- | --- | --- |
| `packages/shared` | Quote/plan/error schemas, stable payment ID, policy types | A+B |
| `contracts` | Guardian action, account-scoped state/guard, policy and adversarial tests | A |
| `packages/wallet` | Pinned Kernel route, policy reads, simulation, receipt decoding | A+B |
| `packages/database` | Tasks, quotes, plans, attempts, batch items, lease/fencing | B |
| `packages/planner` | Astra planner, quarantined vendor parser, bounded read/propose tools | B |
| `apps/worker` | Scheduler, claims, bounded batching, restricted signer, reconciliation | B |
| `apps/api` | Owner authentication, task/quote/plan/status APIs | B |
| `apps/web` | Enterprise dashboard, agent exchange, evidence and owner controls | C |
| Provider demo | Separate provider process; actual AI or explicitly labeled fixture | C+B |
| `tests` / `docs` | Acceptance IDs, English demo, evidence and evaluation | A+B+C |

Existing workspace directories are not evidence that these modules are implemented.

## Branch strategy

Use short-lived branches from an up-to-date `main`, one reviewer from another role,
and small integration PRs. A separate `develop` branch is unnecessary for this team.

| Proposed branch | Owner | Dependency / acceptance for merge |
| --- | --- | --- |
| `feat/shared-contracts` | A+B | G0: quote, policy, payment ID, errors, ABI agreed with C. |
| `feat/guardian-policy` | A | G0; pinned Kernel path, allowed/rejected/revoke, invariant and bypass tests. |
| `feat/agent-orchestration` | B | G0; incremental DB/auth/planner PRs, then G1 for executor; recovery before auto retry/batch. |
| `feat/enterprise-dashboard` | C | G0; labeled fixtures initially, real exchange/evidence only after G1. |
| `test/adversarial-demo` | A+B+C | G2; SEC/REL/COST suite and benign controls, direct jailbreak plus contract fixture. |
| `docs/submission` | C, review A+B | Implemented architecture and actual evidence reflected in English materials. |
| `release/submission` | All, one release owner | G3; frozen source, checks, deployment and recorded evidence refer to one revision. |

```text
G0 schema/ABI/paymentId
 |-- A: Kernel route -> Guardian single payment -> invariant/bypass tests
 |-- B: DB/auth -> Astra/parser -> executor/reconciler
 `-- C: dashboard -> provider process -> evidence views
                        |
G1 real allowed payment + rejected operation + revoke
                        |
G2 end-to-end + stale/unknown recovery + safe bounded batch
                        |
G3 adversarial + cost evaluation + deployment rehearsal -> release/submission
```

UI, API, and model work can progress on G0 fixtures. Financial integration needs the
G1 route, and batching needs aggregate/atomicity tests before activation. G2 includes
recovery with no duplicate logical settlement; G3 records actual results, not just scripts.

Each PR describes schema/ABI changes, dependent branches, relevant checks and evidence
IDs. Coordinate root lockfile edits. A final release identifies the exact source
revision, deployed addresses, model IDs, policy, fixtures and evidence manifest.
