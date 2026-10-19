# Reviewer runtime dependency boundary

The reviewer service is launched from `tools/review/serve.mjs`; its authenticated
session host is in `apps/api/src/review-host.ts` and UI is in `apps/web/app/review`.
This workspace declares the minimal Hardhat/viem runtime and PGlite as production
dependencies, so the review container can prune unused development tooling after
building. The reviewer loads a programmatic fork-only HRE, not owner dotenv or the
test toolbox configuration. It adds no
separate frontend or signing authority over the owner's deployed wallet.

See `docs/REVIEW_DEPLOYMENT.md` and `Dockerfile.review`.
