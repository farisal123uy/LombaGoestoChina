# Execution evidence

No deployment or financial transaction has been performed by this scaffold.

For each actual demonstration, record:

- Source revision and deployment version.
- Task ID, intended outcome, initial state, and policy version.
- Chain ID, account, token address/decimals, recipient, and integer amount.
- UserOperation hash, final transaction hash, and explorer URL.
- Receipt status and a separate explanation of task completion.
- Rejected request, relevant policy, and error/trace when no transaction is included.
- Case ID (AI/SEC/REL/COST), actual model ID/config, input source and output origin
  (`live_model` or `adversarial_fixture`); live vs recorded replay.
- Verified provider quote/invoice, stable payment ID, quote hash/expiry and service
  acknowledgement/probe. Label fixture provider AI and mock provisioning.
- Observed block/hash/time, current policy/session/pause, pre/post token balance,
  daily-spending counter, consumed payment IDs and allowance where relevant.
- Prepared attempt ID/family, keyed nonce and sequence, expected UserOperation hash
  derived before send, submission block/time, replacement links and reconciliation
  timeline; never export keys or reusable signed payloads in public evidence.
- Batch membership/total, atomicity outcome, actual UserOperation success and payment
  events distinct from the enclosing transaction's receipt status.
- Single/batch fees, execution/validation/L1-data components where applicable,
  surcharge, payer/sponsor, model cost, failed attempts, queue latency and any USD
  conversion assumptions. Include chosen chain confirmation threshold/reorg handling.

A failed pre-submission check may have no on-chain transaction hash. A model response,
an HTTP success code, or a submission hash is not a confirmed payment.

Base Sepolia is the development network. Confirm the accepted evidence network with
the organizing committee and label test tokens clearly.

## Required evidence bundles (all pending)

| Bundle | Expected result; not yet observed |
| --- | --- |
| AI-01 | Astra/provider request and quote; one 0.26 settlement and separate service outcome. |
| SEC-01 | Actual dashboard jailbreak output, then labeled hostile-plan contract test; no unauthorized token transfer. |
| SEC-02 | Vendor injection corpus, parser/planner outputs, decisions and benign-case controls. |
| SEC-03–07 | Batch daily sum, protected balance, reentrancy, approval/bypass, pause/revoke results with isolated preconditions. |
| REL-01–03 | Inference/chain state races; lost send response, restart/nonce/reorg; atomic batch and post-payment service failure. |
| COST-01 | Comparable single vs batch 4/7 measurements within the 2.00 cap, latency and cost payer. |

For SEC-01, distinguish local EVM execution, public-chain simulation, bundler rejection
and mined revert. Only the first three may be available for a rejected operation;
none implies a mined failure. Preserve the real authorization path in contract tests.
The [demo script](demo-script.md) must refer to actual saved results before recording.
