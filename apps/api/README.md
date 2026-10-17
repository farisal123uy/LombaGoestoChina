# API

Implemented process routes:

- `GET /health`: process health only.
- `GET /v1/status`: implementation stage and pending capabilities.

The configured backend also provides owner nonce/signature authentication, policy
reads, bounded plan previews, durable invoice tasks and local worker controls.
See `../../docs/ab-handoff.md` for the endpoint table, schemas and configuration.
The API holds no session/owner signing key. A healthy process does not imply database,
model or on-chain execution readiness. Without database/account configuration it
provides health/status only; financial routes return 503.

Use `HOST=0.0.0.0` when deploying the service to a container platform, and set
`WEB_ORIGIN` to the actual frontend origin.
