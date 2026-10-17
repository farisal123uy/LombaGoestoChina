# Web dashboard

Next.js frontend with `/setup` owner onboarding and `/dashboard` procurement,
owner login, task/operation evidence, scheduling controls and provider service actions.
The existing components are an integration reference for further UI/product work.

Run from the monorepo root with Node >=22.13 and npm 10:

```sh
npm ci
npm run build:packages
npm run dev:web
```

Open `http://localhost:3000/dashboard`. Frontend rendering does not require backend
credentials; live financial data/actions require a reachable configured API and the
registered owner's wallet login. An unavailable API is shown explicitly.

Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` if the API is not at
`http://localhost:4000`. On another computer, localhost refers to that computer.
Only public endpoint configuration belongs in the web environment.

Read [Frontend handoff](../../docs/FRONTEND_HANDOFF.md) for branch checkout,
integration files, API/auth behavior and collaboration boundaries.
