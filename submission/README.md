# Submission materials — Guardian Wallet: Astra

Team-maintained International Track, Topic F materials, aligned on October 20, 2026.
This folder contains four content documents, this index, four PPTX decks and two MP4 videos.
Start with the [judge quick start](../JUDGES.md) to try the hosted application.

## Documents and decks

| Material | Markdown | PPTX | Slides |
| --- | --- | --- | --- |
| Technical documentation | [Document](01-technical-documentation.md) | [01-Technical-Documentation.pptx](01-Technical-Documentation.pptx) | 10 |
| Source, deployment and tests | [Document](02-source-code-deployment-and-tests.md) | [02-Source-Code-Deployment-and-Tests.pptx](02-Source-Code-Deployment-and-Tests.pptx) | 9 |
| Security self-assessment | [Document](03-security-self-assessment.md) | [03-Security-Self-Assessment.pptx](03-Security-Self-Assessment.pptx) | 10 |
| Main presentation | [Presentation material](PRESENTATION_MATERIAL.md) | [04-Guardian-Wallet-Astra-Presentation.pptx](04-Guardian-Wallet-Astra-Presentation.pptx) | 11 |

## Videos

| File | Duration | File size | Resolution |
| --- | --- | --- | --- |
| [Demo_Project.mp4](Demo_Project.mp4) | 5:43.233 (343.233 seconds) | 342,525,443 bytes (326.66 MiB) | 1918 × 970 |
| [Vidio_Presentation.mp4](Vidio_Presentation.mp4) | 10:11.200 (611.200 seconds) | 677,094,073 bytes (645.73 MiB) | 1918 × 1078 |

The team selected these recordings at their supplied durations. The supplied rules specify
a five-minute demo and ten-minute presentation; the recorded durations above are retained
by the owner's decision and are not labeled as meeting those timing limits.

Both MP4 files use Git LFS through the repository's `submission/*.mp4` rule. After cloning,
run `git lfs pull` to retrieve the actual videos. Application setup does not require them.

## Source, deployment and interface identity

- Repository: <https://github.com/farisal123uy/LombaGoestoChina>.
- Publication branch: [main](https://github.com/farisal123uy/LombaGoestoChina/tree/main).
- Integration commit: `3570de7`, preserving both the original `main` history and the
  selected `feat/batching-evaluation` candidate `f8b6c87`.
- Verified runtime baseline: [d5517adc9d551ba6df36b53a357001bb35edd981](https://github.com/farisal123uy/LombaGoestoChina/commit/d5517adc9d551ba6df36b53a357001bb35edd981).
- Deployed archive/build SHA-256: `4fc4f46ebf05e5c7ee2f2e3bad68871d4b80474338a2081d21c1bfe3b64dbdb3`.
- Materials revision: use the commit containing the reviewed files; run `git rev-parse HEAD`
  in that checkout or retain the commit permalink. The runtime baseline above identifies
  application code, not a claim that the later materials were part of that deployment.
- Selected UI/UX: the verified interface integrated into `main`, recorded in
  [frontend integration](../docs/FRONTEND_INTEGRATION.md). The separate UI-redesign branch
  is not the selected release interface.
- The source deck's older `b439c8f` base label is historical. Use the runtime baseline,
  deployed build and materials revision listed here for current release references.

## Checks and packaging

- All four PPTX files passed ZIP integrity and XML parsing checks; their slide counts
  are listed above. This does not substitute for a visual slide-by-slide review.
- Both videos loaded in Chromium with decoded video and audio at early, middle and late
  sample points. This is sampled playback, not a full narration or audio-quality review.
- The application checkpoint passed 156 tests plus lint, typecheck and production build;
  details and evidence boundaries are in [progress](../docs/PROGRESS.md).
- `npm run release:source` creates a source-only review archive with an inventory. PPTX
  and MP4 binaries are excluded, so retain these materials separately with the source revision.
- Official upload and receipt status is tracked in the [release checklist](../docs/RELEASE_CHECKLIST.md).
