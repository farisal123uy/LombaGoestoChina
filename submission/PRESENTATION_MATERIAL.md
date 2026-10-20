# Presentation Material — Guardian Wallet: Astra

- **Title:** Guardian Wallet: Astra — An Owner-Controlled Agent Wallet with Bounded On-Chain Authority.
- **Track:** International Track, Topic F — Agent Wallet.
- **Last aligned:** October 20, 2026.
- **Source basis:** `feat/batching-evaluation`, based on `b439c8fb5662acb13724314923951bb11091b71a` with the October 20 updates; identify the exact revision through Git HEAD or the source inventory.
- **Format:** eleven slide-ready content sections. Existing PPTX files and the screen recording are separate materials, not revalidated by this Markdown revision.

## Slide 1 — Guardian Wallet: Astra

**AI-assisted procurement. Owner-controlled wallet. Bounded on-chain execution.**

- An owner delegates a database-service procurement task through a restricted smart-account session.
- Astra interprets the goal; deterministic code verifies the invoice; Guardian enforces the policy.
- Models hold no signing keys. The worker holds only the authorized session.
- Public Base Sepolia receipts, actual fork execution and live-model evaluations are labeled separately.

## Slide 2 — Problem and objective

- Agents need operational capabilities such as obtaining a quote, paying an invoice and verifying delivery.
- Unrestricted signing access makes model errors, malicious instructions and forged approval consequential.
- A successful payment does not prove a service was delivered; a missing response does not prove a payment failed.
- The objective is useful delegation with bounded token exposure, authenticated invoices, durable recovery and inspectable service evidence.

**Product scope:** one configured owner/account per financial API instance, one policy token,
fixed catalog, direct settlement or opt-in escrow. Trading, staking, arbitrary-recipient
payments and model-controlled policy administration are outside scope.

## Slide 3 — Implemented wallet workspace

- `/setup`: owner login, sponsored bootstrap, installed policy and separate session authorization.
- `/dashboard`: English/Indonesian assistant, asset/budget overview, deterministic risk checks,
  draft/payment review, queue controls, task receipts and service probe/KV access.
- `/review`: disposable wallet/contracts/PGlite workspace on an isolated Base Sepolia fork.
- `/evidence`: labeled public receipts, fork tests and recorded model evaluations.

| Demo parameter | Value |
| --- | --- |
| Initial allocation / reserve | 10 / 6 MockUSD. |
| Per-payment / fixed UTC-day cap | 1 / 2 MockUSD. |
| Small service | 1 MiB, 1 hour, 0.26 MockUSD. |
| Standard service | 4 MiB, 4 hours, 0.52 MockUSD. |

MockUSD is a six-decimal test token, not USD or USDC. Services are real, team-operated
expiring PostgreSQL JSONB namespaces, not dedicated cloud database instances.

## Slide 4 — Architecture and technology

```text
Owner / MetaMask -> Kernel policy + scoped session authorization
Web -> financial API -> Astra <-> provider agent -> separate catalog signer
                         |
               verified quote / PaymentPlan -> PostgreSQL
                         |
          worker: fresh validation -> sign -> persist exact operation -> submit
                         |
              bundler -> EntryPoint 0.7 -> Kernel 0.3.1 -> GuardianPayments
                         |
              settlement/escrow -> signed delivery -> probe/activation
```

| Layer | Technology |
| --- | --- |
| Application | TypeScript, Next.js/React, Fastify, Zod, viem. |
| Model | Groq `openai/gpt-oss-120b`; 20B is an explicit comparator; no automatic model fallback. |
| Persistence | PostgreSQL/Drizzle; PGlite for isolated reviewer/tests. |
| Authorization | Kernel 0.3.1, EntryPoint 0.7, ERC-4337 UserOperation, scoped call/timestamp policies. |
| Contract | Solidity 0.8.28; GuardianPayments ERC-7579 executor; EIP-712 quote/delivery signatures. |
| Verification | Hardhat, Vitest, Playwright and actual Base Sepolia forks. |

Guardian is a separate installed executor with per-account policy/accounting. Direct/lock
token transfers are performed by Kernel through `executeFromExecutor`; escrow custody is in Guardian.

## Slide 5 — Procurement, review and delivery

1. The owner authenticates; deployment/delegation authority remains a separate wallet signature.
2. Astra selects a bounded intent; the provider signer issues an authenticated catalog invoice.
3. Assistant procurement creates an eligible non-executable draft and payment review.
4. Explicit queue release rechecks selected IDs, active-account ownership, existing attempts and capacity.
5. The running worker claims the task, revalidates/simulates, signs and commits its exact operation before send.
6. Canonical operation/Guardian evidence determines payment/lock status; service verification determines completion.

**Direct service request** is a separate entry path: an eligible result can be stored as
`planned` immediately and execute when scheduling is active. Queue review is not universal
across all procurement endpoints. **Start agent** enables scheduling, not a missing process or new authority.

| State | Interpretation |
| --- | --- |
| Task `draft` / `planned` | Not a confirmed payment. |
| Task `paid` | Confirmed direct settlement; delivery still needs verification. |
| Task `escrowed` | Confirmed lock; provider release or timeout recovery remains. |
| Task `completed` / `refunded` | Verified completion or confirmed escrow refund. |
| Operation `unknown` / `needs_review` | Preserve/reconcile the existing attempt; do not create a blind fresh-nonce payment. |

## Slide 6 — Permission and spending controls

| Principal | Authorized role |
| --- | --- |
| Owner | Policy/recipient configuration, delegation, pause/unpause and session revocation through owner authority. |
| Model | Bounded interpretation/decision and summary; no key, signer tool or invoice amount/recipient authority. |
| Financial API | Authenticated state/quote checks and task management; no worker session signing key. |
| Worker/session | Permitted Guardian target/selectors, CALL type, zero native call value and expiry. |
| Guardian | Signature/binding, reserve, per-payment/UTC-day cap, recipient, replay, expiry and atomic transfer checks. |
| Provider signer | Fixed-catalog quote/readiness signatures and namespace management, not owner authority. |
| Reviewer capability | Route/time/rate-limited access to one disposable workspace. |

The agent route excludes arbitrary transfer/approval/admin, mixed/nested/delegatecall
bypasses and Kernel ERC-1271 session authority. Direct batches are limited to ten invoices;
one failed item reverts the batch. Escrow adds explicit lock/release/refund selectors and
uses one invoice. Owner actions, other modules and old allowances remain separate boundaries.

## Slide 7 — Public receipts and the reviewer boundary

| Record | Observed result | Evidence level |
| --- | --- | --- |
| AI-01, October 17 | 0.26 MockUSD direct settlement; recorded balance 10.00 → 9.74; signed delivery and database probe/write-read. | Public Base Sepolia; historical local Qwen run. |
| Escrow, verified October 19 | 0.26 MockUSD lock, provider-attested release and staged namespace activation on separately authorized Kernel index 1. | Public Base Sepolia; GPT-OSS 120B/Groq. |
| Reviewer validation, October 18 | Real hosted-model workflow and actual fork-local execution; public HTTPS browser verification through probe/write-read. | Hosted access to an isolated fork, not a new public payment. |

Public escrow transactions: [lock](https://base-sepolia.blockscout.com/tx/0xf208e8aaec33e4d3e1ff2efeda9b3bc461dcaa4302f4e2863d6798698bc28ee3)
and [release](https://base-sepolia.blockscout.com/tx/0x328f10ba0f1f54f8b87f4b08006b33a825621b950c670f2e207450653f319904).
Historical direct payment: [AI-01 transaction](https://sepolia.basescan.org/tx/0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d).

The current reviewer factory uses escrow and generates disposable credentials. Reviewer
capabilities last 15 minutes; closing/expiry discards the workspace. Recorded namespace
liveness and hosting verification do not establish current availability or full-period uptime.

## Slide 8 — Selected live-model and authorization evaluation

| Item | Recorded result |
| --- | --- |
| Model/protocol | Groq `openai/gpt-oss-120b`, strict JSON Schema, temperature 0 and bounded requests. |
| Corpus | 30 unique cases repeated twice: 60 observations across planner, buyer, provider and vendor parser. |
| Preserved baseline | 54 passes and 6 inconclusive API/schema errors out of 60. |
| After correction | Planner 16/16, buyer 16/16, provider 12/12, vendor 16/16: **60/60 objectives**. |
| Controls/attacks | Benign/wait controls, owner/prior-approval/role spoofing, drain/limit bypass, allowance/recipient/price manipulation and encoded vendor injection. |
| Effects | Synthetic financial context; no payment submission or signing credentials in model prompts/tools. |

The result is **in-sample regression**, not sixty independent jailbreaks or universal
prompt-injection resistance. Separate actual Kernel fork fixtures test allowed payments,
hostile-plan/bypass rejection and owner revoke. Permit-selector rejection does not prove
all EIP-2612/Permit2 behavior because the fixture lacks token-level permit support.

Model comparison used the same eight selected cases/model: both 120B and 20B passed 8/8.
Recorded P50/P95 were **675/1008 ms** and **580/621 ms**, respectively. These small selected
measurements do not establish general superiority; 120B remains the explicitly selected default.

## Slide 9 — Batching efficiency and economic scope

| Invoices | Service total | Single-mode enclosing EVM gas | Batch enclosing EVM gas | Reduction |
| --- | ---: | ---: | ---: | ---: |
| 4 × 0.26 | 1.04 MockUSD | 1,086,084 | 449,692 | **58.59%** |
| 7 × 0.26 | 1.82 MockUSD | 1,870,809 | 600,987 | **67.87%** |

- Three repetitions per mode from identical warmed-session fork snapshots, fixed estimates and the same invoices/budget.
- Actual Kernel/Guardian and worker execution, with a local bundler stub; first session activation is excluded from steady-state comparison.
- Enclosing EVM gas is the primary metric. EntryPoint accounting is affected by generous stub limits and unused-gas penalties.
- Excludes OP L1-data, commercial bundler/paymaster pricing, inference, hosting and production latency/failures.
- Savings come from deterministic aggregation, not an AI-specific economic advantage. No USD/mainnet ROI claim is made.

Direct batching is opt-in above the default size **1**, with maximum size **10** and window
**30 seconds**. It preserves the earliest deadline and aggregate capacity. Escrow does not batch.

## Slide 10 — Recovery and verification coverage

```text
account lease/fence -> fresh state -> prepare/sign
  -> commit payload + expected hash + keyed nonce + membership
  -> send -> missing response: unknown
  -> reconcile canonical receipt / EntryPoint / Guardian / consumed IDs
  -> confirmed result, pending evidence or operation needs_review
```

- The tested actual-Kernel lost-response recovery reconciled one durable payment with **one send**.
- Disk/process-restart tests preserve the attempt across worker restart without a second payment.
- Fixtures cover reorg/confirmation/nonce conflicts, partial settlement, consumed-without-receipt, head lag and outages.
- Delivery retries are separate from payment. Escrow release/refund has its own persist-before-send journal.

| Latest local checkpoint, October 20 | Passed |
| --- | ---: |
| Integration | 105 |
| Web unit | 8 |
| Browser Chromium | 25 |
| Contract/fork with RPC | 17 |
| Docker-context tooling | 1 |
| **Total** | **156** |

Lint, typecheck and production build passed. Latest full/production dependency scans report
zero known advisories. Context checking is not a Docker image build, and one successful
recovery scenario is not a global exactly-once or availability guarantee.

## Slide 11 — Result, boundaries and next validation

**Implemented:** owner setup, bounded assistant/procurement, signed catalog invoices, direct
payment, opt-in escrow, deterministic batching, durable recovery and an isolated reviewer.

**Boundaries:** testnet assets, team-operated provider, trusted readiness attestation,
single-owner/instance authentication, process-held credentials, fixed UTC spending window,
per-operation gas cap and limited hosting/model quota.

**Evidence:** inspectable public direct/escrow receipts, real selected cloud-model evaluations,
actual Kernel fork tests, measured local batching and explicit browser/chain-driver fixtures.

**Next validation:** independent security review, held-out multilingual adversarial testing,
multi-process/pooler/reorg stress, stronger operator/key management, all-in production cost
measurement and owner usability evaluation. No independent audit, mainnet-readiness or
universal prompt-injection immunity claim is made.

## Submission references

- [Technical documentation](01-technical-documentation.md), [source/deployment/tests](02-source-code-deployment-and-tests.md), [security self-assessment](03-security-self-assessment.md).
- [Current README](../README.md), [latest checkpoint](../docs/PROGRESS.md), [release checklist](../docs/RELEASE_CHECKLIST.md).
- [AI-01](../docs/evidence/AI-01-public-procurement.md), [public escrow receipt](../docs/evidence/public-escrow-procurement.json), [escrow design](../docs/ESCROW_PROTOTYPE.md).
- [Cloud validation](../docs/evidence/CLOUD-VALIDATION.md), [cloud regression](../docs/evidence/security-cloud-model-evaluation.json), [preserved baseline](../docs/evidence/security-cloud-model-baseline.json).
- [Kernel fork evidence](../docs/evidence/security-kernel-fork.json), [COST-01 method](../docs/BATCHING_AND_COST.md), [raw cost results](../docs/evidence/cost-fork.json).
- [Reviewer guide](../docs/REVIEWER_GUIDE.md), [recorded HTTPS browser workflow](../docs/evidence/reviewer-public-browser.json).
- Standards: [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337), [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579). The project tests the pinned Kernel interfaces; standard references are not an audit of this integration.
