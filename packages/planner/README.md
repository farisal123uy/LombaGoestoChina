# AI planner

The legacy Planner interface remains available. The payment path now uses
BoundedPaymentPlanner and a native Ollama Qwen JSON-schema adapter. Model output
can only choose pay/wait/needs_owner with a summary; it cannot supply quote fields,
calldata, signing or owner approval. `AI_PROVIDER=baseline` selects the deterministic
baseline; `AI_PROVIDER=ollama` uses Qwen without a cloud API key. Local live smoke
evaluation is recorded in `../../docs/evidence/qwen-local-evaluation.json`.

The separate vendor parser has no tools and returns only bounded service attributes
from escaped untrusted text. It is not an injection-proof authorization layer. Keep
all signing credentials outside this runtime; execution revalidates quote/policy.

`QwenClient` uses native fetch, thinking disabled, finite context/output, a bounded
single-flight queue, a total request timeout and ten-minute keep-alive. It rejects
truncated/non-schema outputs; transport errors are sanitized. No AI SDK is required.
