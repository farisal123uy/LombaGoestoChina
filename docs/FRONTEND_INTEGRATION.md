# Frontend integration checkpoint

Frontend source: `origin/feat/enterprise-dashboard`, revision
`4e47b138f1df397291aef5e696dd112b2266bdb7`.
Backend base: `e5ef81f6f0fcfd94f105e182fc3d3ea542fdd06c` with the local stage-two,
assistant, cloud-model and reviewer additions. This is a working-tree integration,
not a published merge commit or final frozen release.

## Integrated work

- Teammate landing design, dark/green theme, Geist typography, recorded evidence
  ledger, copy-hash interaction and seven web tests.
- Existing sponsored owner setup, authenticated procurement dashboard, wallet
  assistant and disposable reviewer capability flow are retained and connected.
- Main calls to action lead to `/review` and `/evidence`. Review-only deployments
  use same-origin runtime health, not a judge's localhost owner API.
- The evidence page also exposes recorded cloud smoke, model comparison, security
  regression and Linux workflow facts. Historical local Qwen evidence is distinct.

## Integration adaptations

- Theme/landing/evidence styles preserve the teammate design while retaining the
  stage-two assistant/reviewer styles. Some CSS formatting is condensed.
- Public badges say recorded public chain, not fresh verification. The landing
  balance is the recorded post-payment balance. Missing adversarial details remain
  unrecorded rather than being invented.
- Public explorer URLs must match the recorded transaction and Base Sepolia host;
  local-fork/model hashes have no public explorer link.
- Evidence uses literal JSON imports, avoiding dynamic filesystem tracing of the
  project/private runtime directories. `Dockerfile.review.dockerignore` explicitly
  includes only the public JSON records needed by the server-rendered pages.
  `release:web-check` checks traces and built output against the configured model key.
- Google fonts are self-hosted by next/font at build time; browsers do not fetch them
  from Google at runtime. The build still needs font-download network access.
- `REVIEW_ONLY=true` keeps owner-only setup/dashboard paths out of the public review
  navigation and redirects direct visits to the reviewer entry point. Owner development
  mode retains those routes.

The frontend branch's expanded security report is represented by the current
`security-assessment.md` and technical/release documentation rather than replacing
the newer backend/cloud report with an older checkpoint. The full teammate revision
remains available in its original branch/history.
