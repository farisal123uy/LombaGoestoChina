# API

Implemented scaffold routes:

- `GET /health`: process health only.
- `GET /v1/status`: implementation stage and pending capabilities.

Wallet authentication, goal management, planning, persistence, and execution routes
are not implemented. A healthy process does not imply these services are ready.
The service runs without API keys or a database for initial local setup.

Use `HOST=0.0.0.0` when deploying the service to a container platform, and set
`WEB_ORIGIN` to the actual frontend origin.
