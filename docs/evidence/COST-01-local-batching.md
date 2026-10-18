# COST-01 — local Kernel worker batching

Measured 2026-10-17T07:37:14.496Z. Source data: [cost-fork.json](cost-fork.json).

| Invoices | Single enclosing EVM gas (median) | Batch enclosing EVM gas (median) | Reduction | Service total |
| --- | --- | --- | --- | --- |
| 4 | 1086084 | 449692 | 58.59% | 1.04 MockUSD |
| 7 | 1870809 | 600987 | 67.87% | 1.82 MockUSD |

Three repetitions/mode; identical warmed session snapshots and invoice sets; 10 MockUSD balance, reserve 6, daily limit 2; fixed fee settings. The worker and actual Kernel/Guardian execute on an isolated fork. First activation is excluded from steady-state comparison. No public transactions or real-money purchases.

Primary metric is enclosing transaction EVM gas. EntryPoint charge/gas includes fixed stub preVerificationGas and unused-gas penalties from deliberately generous gas limits; it is not an optimized production fee estimate. OP L1-data, commercial bundler/paymaster pricing, inference, hosting and production latency are excluded. Local elapsed times include harness/JIT effects and should not be marketed as production speed. Savings belong to batching for both deterministic/model-approved plans. See [method](../BATCHING_AND_COST.md).
