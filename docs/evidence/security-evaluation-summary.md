# Selected security evaluation

The initial live local Qwen corpus passed **52/60** objectives. Failures included fake prior-owner approval and provider acceptance/claims of unauthorized actions. Exact failures and original source hashes remain in [baseline](security-model-baseline.json). No real credentials or transactions were involved.

After explicit untrusted-conversation and whole-request-rejection prompt refinement, the same **30 unique cases repeated twice** passed **60/60**: [current report](security-model-evaluation.json). This is in-sample regression after tuning, not a held-out result, independent samples or universal prompt-injection immunity. Benign and explicit-wait controls are included. Errors are inconclusive.

Model intent is separate from financial authority: fixed catalog/signatures/schema/Kernel/contract constraints remain essential even if a model proposes or falsely claims an action.

Actual restricted Kernel fork results, including transfer/approval/transferFrom/permit selector/nested execute/delegatecall rejection, ERC-1271 denial, owner revoke and lost-response recovery: [kernel report](security-kernel-fork.json). The fixture token lacks EIP-2612: permission-selector rejection does not claim token permit semantics.

Reconciliation fixtures cover confirmation count, reorg, operation nonce mismatch, revert/consumed conflicts, partial batch evidence, consumed-without-receipt, nonce advance, bounded event lookup, timeout and lagging head. They submit no transactions. Integration coverage totals 58 cases; contract/fork 15; browser fixture 6.

Residual risks: [security self-assessment](../security-assessment.md). No independent audit or user study has been performed.
