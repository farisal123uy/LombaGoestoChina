# Cloud AI — GPT-OSS on Groq Free

## Current selection and verification boundary

The selected cloud transport is **Groq Free**, with candidate default
**`openai/gpt-oss-120b`** and explicit comparator **`openai/gpt-oss-20b`**.
`qwen/qwen3.8-27b` remains a reviewed, explicitly selected alternative. The official
documentation checked October 18, 2026 lists all three under Free-plan rate limits
and supports strict JSON Schema output.
This replaces the selected runtime's dependency on the owner's local Ollama process.
Legacy Ollama support remains an explicit opt-in for reproducing historical evidence.

Real API checks now pass: 120B smoke **4/4**, both models **8/8** in the comparison,
both complete HTTP workflows, a Linux production workflow and a public HTTPS browser
workflow. The selected 120B security corpus reaches **60/60** after preserving and
fixing six baseline schema errors. See [CLOUD-VALIDATION.md](evidence/CLOUD-VALIDATION.md)
and [MODEL_SELECTION.md](MODEL_SELECTION.md). These scoped results do not establish
universal security or general model superiority. Historical local Qwen results remain
separate.

Official references:

- Models: https://console.groq.com/docs/models
- GPT-OSS 120B: https://console.groq.com/docs/model/openai/gpt-oss-120b
- GPT-OSS 20B: https://console.groq.com/docs/model/openai/gpt-oss-20b
- Qwen model: https://console.groq.com/docs/model/qwen/qwen3.8-27b
- Free limits / HTTP 429: https://console.groq.com/docs/rate-limits
- Billing and opt-in Developer upgrade: https://console.groq.com/docs/billing-faqs
- JSON Schema: https://console.groq.com/docs/structured-outputs
- Reasoning modes: https://console.groq.com/docs/reasoning

The Qwen alternative is a **preview model**; GPT-OSS is listed as production. If a
selected model becomes unavailable, the configured client fails;
model changes require explicit review and re-evaluation. No router chooses a substitute.

## Keeping charges at zero

Use a Groq account that remains on **Free**, with no Developer upgrade/payment method.
The documentation states that upgrading to Developer requires a valid payment method
and introduces usage billing. This project does not call billing, upgrade or payment
APIs. A normal inference endpoint is not intrinsically free on a paid account: the
operator must verify the account tier.

`GROQ_FREE_TIER_CONFIRMED=true` records that operator confirmation; it is **not an API
inspection or guarantee of account tier**. Do not set it for an upgraded account.

The implementation additionally:

- Pins HTTPS to `https://api.groq.com/openai/v1` and the three reviewed model IDs.
- Rejects arbitrary endpoint/model overrides and redirects carrying the key.
- Has no paid-model/provider fallback, automatic retries, billing activation or top-up.
- Stops on Free-quota exhaustion, propagates `429` and `Retry-After`, and leaves task
  execution status grounded in the actual queue/receipts.
- Shares a conservative budget within each process: 20 requests/minute, 7,000 estimated
  tokens/minute, 800 requests/UTC day and 180,000 estimated tokens/UTC day, below the
  published Free limits at review.
  Separate processes do not share this in-memory counter; the provider enforces the
  actual account-wide quota. Restarting a process does not reset the provider quota.

Published Free limits at review: **30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD**. These are
not unlimited service or an availability guarantee; use the actual account Limits page
and response headers. Changes/limits cause a visible error rather than a paid fallback.

## Private configuration

From the stage-two root:

```powershell
npm.cmd run setup:ai-cloud
```

Create a key at https://console.groq.com/keys. The setup asks for Free-tier confirmation,
hides key input, checks the **model catalog only** (no inference/payment), and writes
ignored `.local/ai-cloud.env` and `apps/api/.env`. An existing ignored provider-agent
configuration is updated without replacing its service tokens. No key belongs in
`NEXT_PUBLIC_*`, Git, a presentation, public evidence or a browser request.

The interactive wizard has two numbered, hidden inputs: first type **FREE**, then
paste the API key at step 2. A key accidentally pasted at step 1 is rejected and the
confirmation is requested again without printing or saving that value to configuration.

For a non-interactive deployment, supply the private environment variables directly:

```dotenv
AI_PROVIDER=groq
AI_MODEL_ID=openai/gpt-oss-120b
GROQ_API_KEY=<server-secret>
GROQ_FREE_TIER_CONFIRMED=true
AI_REQUEST_TIMEOUT_MS=30000
AI_CONTEXT_TOKENS=4096
AI_OUTPUT_TOKENS=1024
```

The reviewer runtime explicitly requires Groq configuration. Missing key/confirmation
does not start a local-model fallback. Existing owner runtime configuration is private
to its worktree; this setup does not activate on-chain execution or migrate its DB.

## Efficiency and measured acceptance

GPT-OSS requests use `reasoning_effort=low` and `include_reasoning=false` with
non-streaming strict JSON Schema. Completion budget defaults to **1,024** and is capped
at **2,048**; it includes reasoning tokens even though reasoning is not displayed.
Qwen uses `reasoning_effort=none`, `reasoning_format=hidden`, default 256 and maximum
512 completion tokens. The incompatible parameters are separated by model profile.
The schema is sent
through `response_format`, without duplicating the full schema in the system prompt.
An estimated input-plus-output budget (default 4,096 tokens) rejects oversized requests
before sending them; actual provider token usage is recorded after the response.
Zod still checks exact field names, formats, lengths and types after generation.
The AI never selects signing keys, recipient substitutions, permissions or raw calldata.

Asset/risk refreshes use the deterministic read endpoints and consume **no model API
requests**. Financial plans are not cached across changing chain state. The worker
does not perform model inference. Limits, bounded queueing and timeouts prevent
unbounded inference workloads.

Measure the actual selected deployment rather than claiming a vendor TPS figure is
user-visible latency:

```powershell
npm.cmd run model:cloud
# Same eight cases for 120B and 20B, interleaved and explicitly paced:
npm.cmd run model:compare
# Optional larger, explicitly paced selected corpora:
npm.cmd run model:wallet
npm.cmd run model:security
```

The cloud smoke report is `docs/evidence/cloud-model-smoke.json` and records each
case, end-to-end inference time from the calling host, input/output tokens and remaining
quota headers. It uses synthetic finances and makes no transaction claim. Larger
benchmarks are deliberately paced for Free TPM and save **separate cloud evidence**.
Errors are inconclusive, not scored as successful attack prevention.

`cloud-model-comparison.json` records correctness, P50/P95 latency, input/completion
tokens and reported reasoning tokens. The benchmark runs eight identical cases/model,
interleaves the two candidates, and waits at least 25 seconds between requests. Pacing
is excluded from measured inference latency. No environment/model is switched
automatically from the score. The `QwenClient`, `createQwenPlanner` names and `QWEN_*`
error codes remain compatibility aliases; `StructuredModelClient`/`modelRuntimeOptions`
are the generic transport exports, and plans always record the actual provider/model.

For historical Ollama reproduction, pass `--local` to evaluation scripts. The chosen
review/cloud runtime does not use that path automatically.

## China-facing review deployment

The current claimed Linux deployment and recorded public HTTPS browser verification
are described in [REVIEWER_GUIDE.md](REVIEWER_GUIDE.md). Three independent probes
reported in Beijing, Shanghai and Shenzhen received valid HTTPS/HTTP 200/readiness
for the same deployed build in 1471/1779/2349 ms; see `china-network-readiness.json`.
This is not a judge browser session or a China inference-latency benchmark.

Moving inference to a cloud API removes the laptop GPU dependency, but **does not by
itself move the backend, chain sandbox or frontend off the laptop**. The intended review
deployment must host those services on an independently running Free service, with
server-side secrets, then verify the public URL from the judge's network.

Groq's advertised token generation speed is not a China round-trip measurement. Judge
browser latency, hosting cold starts, backend-to-Groq latency and fork initialization
must be measured separately. No China accessibility/performance claim is made from an
Indonesian-only test, and no paid hosting upgrade is authorized by this plan.

See [REVIEW_DEPLOYMENT.md](REVIEW_DEPLOYMENT.md) for the container, account/hardware
constraints and release gates. The disposable review flow is verified separately with
an explicit cloud-HTTP fixture; it is not live Groq performance evidence.
