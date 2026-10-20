# Reviewer runtime and zero-billing deployment

## Current deployed checkpoint

- Public application: https://preview-95c94201191f7206.up.railway.app/review
- Source package SHA-256 / public readiness `buildId`:
  `912063431ea05c663abd9df36bdff047687006d5cf8ea9fde87ba8b9b0f9d9c0`.
- Claimed Linux VM; Free/Trial without payment method confirmed by the owner.
  This is native Node deployment, not a tested Docker image. No paid upgrade was invoked.
- Exact deployed ZIP is retained at `.local/linux-review/deployed-source-<buildId>.zip`.
  The local source review package may contain later documentation/checker/evidence
  updates; compare the saved deployment inventory before claiming identical archives.
- Production build, real GPT-OSS flow and public HTTPS browser workflow passed.
  Three independent China probes passed readiness/TLS/build-ID checks. A judge's
  actual browser/network and ongoing Free entitlement still require team monitoring.
- Reviewer instructions: [REVIEWER_GUIDE.md](REVIEWER_GUIDE.md).
  Model results: [CLOUD-VALIDATION.md](evidence/CLOUD-VALIDATION.md).

## Implemented system

`/review` is a self-service reviewer entry point. A reviewer uses a private access code,
receives a 15-minute capability, and gets a disposable Kernel account, Guardian policy,
test token and isolated PGlite PostgreSQL database on an isolated Base Sepolia fork.
The browser needs neither MetaMask nor the owner's wallet credentials.

The original owner application at `/setup` and `/dashboard` remains a separate path
in owner/development mode. Review-only hosting redirects those routes to `/review`.
No owner's `.env`, session or Supabase credentials are loaded by the review factory.
Only the chosen cloud model's server-side key is needed for model inference; it is
removed from the web process environment and never sent to the reviewer browser.

```text
Reviewer browser --HTTPS--> Next.js /review + /api/review proxy
                                  |
                          loopback review host
                           /               \
                    Groq Free API       disposable workspace
                                       PGlite + provider signer
                                       actual Kernel/EntryPoint
                                       restricted worker + service
```

Each workspace starts with 10 test units, reserve 6, per-invoice cap 1 and UTC-day cap 2.
A 1-base-unit historical-day setup payment enables the restricted permission; the
fixture restores token balance and advances to today's UTC window before review access.
UI labels and receipts distinguish fork execution from public transactions. The saved
public AI-01 transaction remains linked as independent historical execution evidence.

## Verified scope

`contracts/test/Review.integration.ts` verifies an actual local-fork escrow lock,
provider-attested release, staged service activation, PGlite probe/write/read,
duplicate-execution prevention and a second isolated wallet/database. In this test
**model HTTP responses are fixtures**, clearly labeled in
`docs/evidence/reviewer-workspace-fork.json`. Real cloud inference and Linux/public-browser
results are recorded separately in the cloud validation report.

The host bounds simultaneous workspaces, session lifetime, per-session request/model
rates and allowed routes. Session A's token cannot access session B. Neither arbitrary
RPC nor the owner's login/admin/signing routes are forwarded. Closing/expiry removes
access and closes worker, DB and chain resources after active requests finish.

## Container and private variables

The provider-neutral **`Dockerfile.review`** builds web/API/worker/contracts and runs
`tools/review/serve.mjs`. Web listens on `PORT` (default 7860), the review host only on
loopback 4300. It needs no local Ollama, GPU, tunnel, commercial DB or public paymaster.
The original `Dockerfile` serves the owner API/worker and is not this review image.

Use `deployment/review.env.example` as the variable inventory. Set actual values in
the host's secret settings, not in source or Docker build arguments:

- `GROQ_API_KEY`, `GROQ_FREE_TIER_CONFIRMED=true` for a verified Free account.
- `REVIEW_ACCESS_CODE`: at least 32 unpredictable characters, shared privately with judges.
- `AI_MODEL_ID=openai/gpt-oss-120b`, completion budget 1024, timeout 30000 ms.
- `REVIEW_MAX_SESSIONS=1` initially; raise only after capacity measurement.
- `KERNEL_FORK_RPC_URL=https://sepolia.base.org`: fork reads only. The simulated chain
  executes every write; this is not an Internet-facing RPC proxy.

Container execution, where Docker is installed:

```sh
docker build -f Dockerfile.review -t guardian-review .
docker run --rm -p 7860:7860 --env-file /private/review.env guardian-review
```

`Dockerfile.review.dockerignore` explicitly includes the public escrow procurement
JSON imported by the frontend. `npm run test:tooling` checks that every frontend
evidence import is represented in this allowlist. This source-context check is separate
from building/running the image; Docker is not installed in the current Windows workspace.

`/api/review/health` checks liveness. `/api/review/ready` checks the chosen model's
catalog availability and the fork source, plus workspace slots. Readiness is not a
successful inference/transaction claim. Use the live smoke and reviewer workflow below.

The reviewer uses a minimal programmatic fork-only Hardhat runtime, without owner
dotenv or the test toolbox. The compact PGlite configuration reduces startup memory;
it does not replace per-workspace data isolation. Only one session is enabled initially.
`REVIEW_BUILD_ID` accepts a public 40-character Git SHA or 64-character source SHA-256,
not arbitrary input. Rollout checks that the public response matches the exact archive.

## Hosting evaluation (official documentation checked October 18, 2026)

The budget remains **zero charges and no paid-plan activation**. Packaging a container
does not establish a free hosting entitlement or deployment. No cloud account is
configured or billed by these files.

### Resource-capable candidate: Railway capped Full Trial

Official trial documentation: https://docs.railway.com/reference/pricing/free-trial

- New accounts receive up to 30 days / $5 one-time credits; resource cap is 1 GB RAM.
- Full Trial network access depends on automated GitHub-account verification. Limited
  Trial egress may prevent the Groq/fork calls; paid upgrade is outside this budget.
- After 30 days/credits, the Free plan grants $1/month, not permanent unrestricted
  hosting. Availability must be checked for the entire judging period.
- Use a Trial/Free account **without a payment method or paid upgrade** and inspect
  current plan/credit limits in the dashboard before deploying. If eligibility or
  sufficient free resources are absent, deployment remains blocked.
- The prepared config is `deployment/railway.review.json`; choose it as the Railway
  config path. It uses `Dockerfile.review`, a liveness health check and bounded restart.
- Publish the reviewed source revision after frontend integration, add secrets, and
  select an available Asia region if the Free account offers it. Do not deploy an old
  backend-only checkpoint and call it the final stage-two source.

### Render Free: eligible only after capacity/latency acceptance

Official sources: https://render.com/docs/free and https://render.com/docs/regions

- Free web services have 0.1 CPU / 512 MB RAM and sleep after 15 idle minutes.
- Cold start is documented at about one minute, in addition to workspace initialization.
- Singapore is an available Render region, subject to the account/service dashboard.
- Bandwidth/build overage is suspended/disabled instead of billed **when no payment
  method is present**. Adding billing changes this behavior.
- The current two-process web/fork runtime cannot be assumed to fit 512 MB. Local
  observations exclude the separate web process and do not prove Linux memory/CPU
  suitability. Do not declare this option accepted without measuring a complete hosted
  session; an out-of-memory or long initialization failure is a failed gate.

The recorded Windows combined contract-test process observed about 853 MiB RSS after
the first reviewer workspace and about 1,067 MiB with two. It includes prior test
activity and excludes the separate web process, so it is not a standalone/Linux
deployment measurement. A 1 GB hosting claim is also unproven; keep one workspace and
measure the complete hosted process group before declaring resource acceptance.

### Hugging Face Docker Spaces do not meet the new-account zero-cost assumption

Official source: https://huggingface.co/docs/hub/en/spaces-overview

The current documentation says creating Docker/Gradio compute Spaces requires a paid
plan, even though CPU Basic hardware itself has no hourly cost. A new Free account's
static Space cannot run this backend or hold server secrets. The Docker SDK's port
7860 support alone is not proof of zero-cost eligibility.

## Public acceptance before sharing with judges

1. Key/Free account configured; `npm run model:cloud` succeeds and records actual model,
   response time and tokens. Run `model:compare` before declaring 120B/20B superiority.
2. Reviewed source/container is deployed on an eligible independently running Free host.
3. Verify public HTTPS `/review`, health and readiness from outside the owner's LAN.
4. Create a workspace, inspect assets/risk, obtain a draft, queue, start, observe
   `completed`, inspect the local-fork receipt and verify service probe/write/read.
5. Close the workspace, confirm a second session is isolated and capacity is released.
6. Measure cold/warm initialization, P50/P95 model latency, whole-workflow time and
   memory/CPU against the actual host limits. Include failures and quota responses.
7. Have someone on the judge's China network verify reachability and latency. An
   Indonesian-only check is insufficient for a China accessibility claim.

The laptop/tunnel experiment is stopped. Current team release steps are ongoing
hosting-credit/eligibility monitoring, a check on the judge's exact network, team
identity/eligibility, organizer acceptance of Base Sepolia, and official submission.
Frontend `4e47b13` is integrated and the API key is configured privately. The owner
has authorized source publication on the `feat/batching-evaluation` branch; `main`
remains unchanged. Presentation/video materials are maintained in the root
[submission folder](../submission/), separately from runtime deployment and official upload.

For this VM rollout, `node tools/deploy/linux-review.mjs --claimed-free` uses the
dedicated private SSH identity, verifies a source-only archive, builds/prunes a fresh
versioned release and runs the live fork workflow before switching the public service.
Secrets travel through encrypted stdin. Activation stops only owned app processes,
switches the release alias and checks readiness/build ID; the previous release/environment
is retained for rollback. Fresh extraction prevents removed project files surviving an overlay.
Private stage logs and current verification reports stay under `.local/linux-review`.

After rollout, run `node tools/review/check-browser.mjs --public --local-report` and
`node tools/deploy/check-china-network.mjs --local-report` to verify the current build
without overwriting historical public evidence captures. `release:readiness` prefers
these current local reports, checks their build IDs and reports Git publication state.

The native supervisor does not create a system-wide startup service. Monitor health
and host lifecycle; a VM deletion/restart or exhausted Free credits is not prevented
by application tests. The supplied container/config supports a later managed service
deployment without changing wallet authority.
