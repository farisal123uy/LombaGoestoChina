# Guardian web workspace

The application shares one persistent navigation shell: **Overview → Setup → Wallet → Evidence**, with a separate **Review** sandbox in the same visual system.

## Navigation and sessions

- Next.js client navigation connects all sections and marks the current destination.
- Setup shows actual connection, deployment and authorization progress. A configured runtime exposes a direct link to the wallet workspace.
- Owner setup and wallet login sessions remain distinct. Both are retained in React memory during internal navigation; a reload or wallet account/network change clears them. No owner access token is added to browser persistent storage.
- `REVIEW_ONLY=true` hides owner navigation and redirects `/setup` and `/dashboard` to `/review`. The sandbox keeps its own capability and clearly labeled local-fork receipts.

## Workspace UI

- Astra is the primary interaction area, with an instruction suggestion that fills the editor without sending a request.
- On-chain balances, scheduler state, task filters and agent activity have dedicated sections.
- Task details expose settlement progress, copyable hashes, public Blockscout links and service probe/write-read controls. Local-fork hashes do not link to public explorers.
- Evidence sections have in-page navigation and an expandable complete hash index. Recorded figures and their provenance are preserved.
- The public escrow deployment and a completed Base Sepolia lock/release flow are shown as a separate recorded receipt, distinct from historical direct settlement and local-fork tests.
- Narrow layouts use stacked panels and compact navigation. Keyboard focus, skip navigation and reduced-motion preferences are supported.

## Design direction

Graphite surfaces, mint highlights, muted lavender for Astra, custom SVG line icons and a policy-boundary illustration form the Guardian visual identity. General application-shell composition was informed by the [shadcn/ui sidebar documentation](https://ui.shadcn.com/docs/components/sidebar); the implementation uses the project's React/CSS stack with original artwork and no added component library.

## Verification

From the repository root:

```powershell
npm.cmd run wallet:escrow:verify -- --record
npm.cmd run test:web
npm.cmd run test:e2e
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Browser fixtures cover onboarding, session continuity, mobile navigation, task filtering, separate escrow lock/release links and reviewer isolation. They do not submit public transactions. Local visual-review captures are under `.local/ui-visual-review/`.
