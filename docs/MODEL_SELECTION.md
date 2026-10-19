# Runtime model decision

**Selected model:** `openai/gpt-oss-120b`, Groq Free account confirmed by the operator.
**Explicit comparator:** `openai/gpt-oss-20b`. No automatic fallback/router is enabled.

The same eight-case comparison passes 8/8 for each. 20B has lower measured P50/P95
inference latency and fewer completion tokens in that corpus. In the complete reviewer
workflow, both succeed in about eight seconds after workspace initialization; 120B's
whole-flow completion-token total is lower for that task (650 vs 770). This difference
is small and includes model/scheduler variability.

120B is retained because the complete workflow is responsive and its wider selected
30-case, two-repeat security regression was verified at 60/60 after an explicitly
preserved schema-error baseline. That corpus does not prove superiority over 20B or
universal injection resistance. Changing the runtime later requires explicit model
configuration and regression, not an unreported substitution on quota failure.

Profile: `reasoning_effort=low`, `include_reasoning=false`, strict JSON Schema,
completion maximum 1024 by default (including reasoning), timeout 30 seconds, exact
Zod validation. The model never supplies price, recipient authority or signer keys.
Observed reasoning tokens count toward usage despite not being shown to users.

Evidence and limitations: [evidence/CLOUD-VALIDATION.md](evidence/CLOUD-VALIDATION.md).
