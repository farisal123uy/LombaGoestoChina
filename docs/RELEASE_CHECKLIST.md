# Competition release gates

This is an implementation/release tracker, not a submission receipt. Presentation and
video preparation remain on hold pending explicit owner authorization.

## Technical gates

- [x] Owner wallet, scoped session and verified public procurement checkpoint exists.
- [x] Asset overview, invoice drafting/queue release and wallet-policy risk API/UI implemented.
- [x] Groq Free profiles for GPT-OSS 120B/20B and explicit Qwen alternative implemented.
- [x] Structured output validation, quota handling and no automatic model fallback implemented.
- [x] Reviewer capability isolation, lifetime, route/resource limits and frontend implemented.
- [x] Actual fork reviewer workflow reaches completed with signed delivery and DB write/read
  using explicitly labeled model HTTP fixtures; second wallet/database is isolated.
- [x] Opt-in reviewer fork workflow locks a payment in Guardian escrow, stages the
  namespace until provider-attestation release, and tests timeout refund. The existing
  owner account at Kernel index 0 remains direct-settlement.
- [x] Owner onboarding can opt in to escrow on a fresh Kernel index, obtains a distinct
  owner-signed session permission and configures escrow runtime. A separate owner-authorized
  Kernel index 1 deployment and public lock/release procurement are recorded in
  `docs/evidence/public-escrow-deployment.json` and `public-escrow-procurement.json`.
- [x] Provider-neutral review container and cloud startup/configuration prepared.
- [x] Real Free API key configured privately; GPT-OSS smoke/comparison and live workflow recorded.
- [x] Claimed Free/Trial hosting confirmed by operator; native Linux production workflow verified.
- [x] Public HTTPS browser workflow tested through completed/probe/write-read/close; build ID matches.
- [x] Three selected mainland-China probes verify HTTPS/readiness/build ID (not judge browser).
- [ ] Hosting entitlement/credits and uptime monitored through the judging period; managed
  restart/Docker resource acceptance remains a separate operational choice.
- [ ] Reachability/latency verified from the judge's China network.
- [x] Teammate frontend `4e47b13` integrated into the local source and regression-checked.
- Reviewer route uses isolated fork migrations/session. The original public owner runtime
  remains a separate checkpoint, not a newly migrated public batch-execution claim.

## Documentation/source gates

- [x] Technical architecture/algorithms/security documentation available in docs.
- [x] Permission tiers, known risks and evidence boundaries documented.
- [x] README, deployment guide and runnable tests available.
- [ ] Final source revision frozen for official submission; the project branch
  `feat/batching-evaluation` is being published with owner authorization (`main` unchanged).
- [x] Credential-free deployed source archive/inventory retained after frontend integration;
  later local docs/checker/evidence updates are packaged separately.
- [x] Source review packaging includes the full lockfile license inventory and installed
  top-level license/notice texts. Rebuild/review for the eventual frozen published package.

## Team/official gates

- [x] Actual team identity, institutions, contact and participant eligibility completed by team
  (confirmed by the owner in conversation; personal details are not reproduced in source).
- Network decision: the owner chose to proceed with existing **Base Sepolia public
  testnet / MockUSD** evidence and cancelled the organizer email inquiry. The available
  rules do not explicitly resolve testnet acceptance; no organizer approval is claimed.
  The [archived clarification draft](ORGANIZER_NETWORK_CONFIRMATION.md) is not an active
  release task. Public receipts and local-fork reviewer results remain labeled separately.
- [x] Required English presentation deck prepared after owner authorization (9 slides; target 7:45, under 10 minutes), with Indonesian rehearsal notes and public escrow receipt links in `submission/`.
- [ ] Optional English demo video, if authorized, <=5 minutes; truthful live/fixture labels.
- [ ] Final links/materials reviewed and uploaded through the actual official channel.
- [ ] Portal receipt/confirmation and final source/package copy retained.

Official deadline recorded in the supplied rules: **October 20, 2026, 23:59 Beijing /
22:59 WIB**. The competition's acceptance and eligibility decisions are not software
test results. No gate is complete merely because an artifact has been generated.
