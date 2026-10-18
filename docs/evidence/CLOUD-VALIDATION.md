# CLOUD-01 — hosted model and complete reviewer validation

Recorded October 18, 2026. Provider: Groq; Free tier is operator-confirmed, not a
billing guarantee inferred from response headers. No paid plan activation, public
payment or commercial database purchase was performed by these checks.

## Model comparison

`cloud-model-comparison.json` interleaves the same eight selected cases per model,
with explicit pacing excluded from inference latency.

| Recorded model | Passed | P50 | P95 | Input tokens | Completion tokens including reasoning |
| --- | --- | --- | --- | --- | --- |
| GPT-OSS 120B | 8/8 | 675 ms | 1008 ms | 4032 | 632 |
| GPT-OSS 20B | 8/8 | 580 ms | 621 ms | 4032 | 498 |

20B was faster and used fewer completion tokens in this small corpus. This does not
establish general model superiority or China-network model latency.

## Whole workflow comparison

`reviewer-live-cloud-baseline.json` records real hosted model requests through the
reviewer HTTP host and actual Kernel/EntryPoint/Guardian settlement, signed delivery,
service probe and write/read on disposable forks:

| Recorded model | Model calls | Procurement through verification | Completion tokens |
| --- | --- | --- | --- |
| GPT-OSS 120B | 8 | 8000 ms | 650 |
| GPT-OSS 20B | 8 | 8169 ms | 770 |

Both reach completed, preserve draft/pause boundaries, settle exactly 0.26 test units
and deny the closed capability. Times include scheduler effects; the small difference
is not a statistical performance claim. **120B remains selected**: both candidates
work, its complete-flow outcome is satisfactory and it has the additional selected
security regression below. No automatic model switch/fallback was introduced.

## API/schema regression

The first 60-observation cloud security corpus had 54 passes and six inconclusive
Groq `json_validate_failed` errors on three buyer refusal cases repeated twice. Safe
diagnostics found `needs_owner` decisions and invalid offer choices. The protocol
wrongly required a catalog offer even when no quote was being requested.

The buyer schema now permits JSON null for inactive offers; the prompt explicitly
requests null for wait/needs_owner. A quote request with no matching offer is converted
to needs_owner; the API never forwards null to the provider signer. Integration tests
verify no quote/task/signing side effect for those outcomes.

The preserved `security-cloud-model-baseline.json` remains available. Re-evaluation
of the same 30 cases repeated twice reaches **60/60**, including benign/wait controls.
`security-cloud-model-evaluation.json` records all outputs and metrics. This is an
in-sample protocol/prompt regression, not independent statistical samples, an audit
or universal prompt-injection resistance.

## Production and network evidence

- `reviewer-linux-cloud.json`: Linux production installation, native build,
  dev-dependency pruning, real Groq inference, actual fork settlement, independently
  verified delivery signature, service probe/write-read and replay prevention. This
  latest report includes its actual source hashes and claimed-host label.
- `reviewer-live-browser.json`: production Next.js UI and backend on Windows for QA,
  real Groq and actual isolated-fork transaction/service; no MetaMask, explicit queue,
  completion/probe/write-read/close, no browser requests to Groq/Google Fonts/owner API.
- `reviewer-public-browser.json`: browser on the owner's network through public HTTPS
  to the claimed Linux server; task completed, operation confirmed, namespace probe
  and write/read passed, close succeeded. Total 37703 ms, procurement through write/read
  11276 ms. Deployed build SHA-256:
  `912063431ea05c663abd9df36bdff047687006d5cf8ea9fde87ba8b9b0f9d9c0`.
- `china-network-readiness.json`: independent Globalping probes in Beijing, Shanghai
  and Shenzhen each received HTTP 200, valid TLS, `ready` and the same deployed build.
  Recorded total request times: 1471 / 1779 / 2349 ms. These are public endpoint checks
  on selected datacenter networks, not the judge's browser or a guarantee for all
  Chinese networks. No credentials/capabilities were sent to Globalping.

The deployed source ZIP is retained privately by its exact SHA-256; source publication
is explicitly deferred by the owner. The operator confirmed a claimed Free/Trial VM,
but remaining credits/plan duration must be monitored in the hosting dashboard.
No presentation/video recording was made by these tests.
