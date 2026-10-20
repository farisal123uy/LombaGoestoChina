# AI planner

The payment path uses `BoundedPaymentPlanner` and `StructuredModelClient` (also
exported as the compatibility name `QwenClient`). The default model is
`openai/gpt-oss-120b` on Groq. `openai/gpt-oss-20b` and the reviewed cloud Qwen model
are explicit alternatives; there is no automatic fallback. Model output can choose
pay/wait/needs_owner with a summary; it cannot supply financial quote fields,
calldata, signing or owner approval. `AI_PROVIDER=baseline` selects the deterministic
baseline. `AI_PROVIDER=ollama` with `AI_MODEL_ID=qwen3:8b` enables the legacy local
transport. Current cloud and historical local evidence are labeled separately in
`../../docs/evidence/`; configuration is documented in `../../docs/AI_CLOUD.md`.

The separate vendor parser has no tools and returns only bounded service attributes
from escaped untrusted text. It is not an injection-proof authorization layer. Keep
all signing credentials outside this runtime; execution revalidates quote/policy.

The model client uses native fetch, strict structured output plus Zod validation,
finite input/completion budgets, bounded concurrency and a total timeout. Groq uses
allowlisted HTTPS/model profiles, quota reservation/cooldowns and model-specific
reasoning settings. Ollama disables thinking and uses a ten-minute keep-alive.
Malformed/truncated responses are rejected and transport errors are sanitized.
Deterministic batching and wallet overview/risk calculations are separate from inference.
