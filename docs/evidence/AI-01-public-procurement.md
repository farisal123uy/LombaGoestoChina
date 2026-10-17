# AI-01 — public procurement and verified service delivery

Verified **October 17, 2026, 06:28:32 UTC (13:28 WIB)**. Machine-readable evidence:
[`public-procurement.json`](public-procurement.json). This is a public Base Sepolia
payment and an actual hosted PostgreSQL JSONB test namespace, separate from the
earlier local-fork/browser-fixture/live-quote-preview evidence.

## Result

| Field | Observed result |
| --- | --- |
| Task | `34aef831-2851-4c5d-9eca-545925652091` — `completed` |
| Model | Local Ollama `qwen3:8b`, payment plan `live_model` |
| Offer | `database-small-1h`: 1,048,576-byte namespace for 1 hour |
| Payment | 260000 integer units = **0.26 MockUSD**, a six-decimal test token |
| Settlement | October 17, 2026, **06:25:04 UTC / 13:25:04 WIB** |
| Block | `48225008`, canonical hash and 102 confirmations checked at verification |
| Task delivery | Signed receipt verified; first fulfillment attempt |
| Namespace | `0ef2e9f4-aa5d-4a93-ac07-c2cabeb15a6e` |
| Service expiry | **07:25:04 UTC / 14:25:04 WIB**; lifetime begins at settlement |

[View public transaction](https://sepolia.basescan.org/tx/0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d)

UserOperation:
`0x5a5799732c1c0874843d8f6d11abea9c7e509ef9aada68de670513c72ebeada0`

Transaction:
`0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d`

## Actual recorded agent path

1. Astra service request — `qwen3:8b`.
2. Separate provider-agent offer response — `qwen3:8b`.
3. Deterministic provider signer authenticated the fixed catalog invoice.
4. Astra produced a `live_model` bounded payment plan.
5. Restricted worker submitted the scoped session UserOperation; EntryPoint and
   Guardian independently emitted successful operation/settlement evidence.
6. Worker verified the provider delivery signature and fresh service probe before
   recording `completed`.

Model text never supplies price, recipient or owner authority. This run exercised
the configured owner API and actual worker/provider runtimes, not the CLI quote preview.

## Independent verification after completion

- Outer transaction **and** the exact EntryPoint UserOperation succeeded; sender,
  keyed nonce, paymaster and operation hash match the persisted attempt.
- Exactly **one matching Guardian settlement event in this receipt** binds account,
  payment ID, recipient, amount and plan policy version.
- Invoice consumed flag: **false** before settlement block, **true** at settlement
  block and at verification. Quote signature and offer/request bindings verified.
- Kernel token block-boundary snapshots: **10.00 → 9.74 MockUSD**.
- UTC-day spent snapshots: **0 → 0.26 MockUSD**, under the **2.00** limit.
- Protected balance remains **6.00**, per-payment limit **1.00**, policy version **1**.
- Kernel ETH was **0** before and after settlement. The pinned paymaster was
  `0x777777777777AeC03fd955926DbF81597e66834C`.
- EntryPoint gas used: **761716**; charge: **4570296000000 wei**
  (**0.000004570296 ETH**), paid by paymaster. This is not a full project-pricing,
  all-in L1-data or USD-cost benchmark.
- Delivery signature binds the actual account/invoice/payment/service/namespace/
  transaction and exact rental period.
- A fresh authenticated probe verified the namespace capacity and persisted probe
  UUID. Probe count was **2**; `usedBytesAtProbe` is the snapshot before the optional
  application-value write below.
- A new unique `guardian-evidence-*` key was written and read back successfully.
  Public evidence includes its identifier and value hash; existing application values
  and credentials are omitted.

These balances/counters are block-boundary observations, not transaction-local state
traces. This verifier submitted **zero new UserOperations** and did not create another
payment task.

## Reproduce

Using already-built dependencies with the runtime running:

```powershell
node tools/wallet/verify-procurement.mjs --task=34aef831-2851-4c5d-9eca-545925652091
```

To perform an additional unique-key write/read while the namespace is still active:

```powershell
npm.cmd run wallet:procurement:verify -- --task=34aef831-2851-4c5d-9eca-545925652091 --write-read --record
```

Without `--write-read`, an expired namespace is explicitly reported as
`expired_not_probed`; historical transaction/signature checks remain possible. An
expired service cannot produce a fresh successful liveness/write-read result.
Keep the saved time-stamped evidence for the completed one-hour rental.

The service is a provider-managed PostgreSQL JSONB key/value namespace, not a
dedicated database server. Testnet evidence acceptance remains organizer-dependent.
