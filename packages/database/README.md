# Database workspace

Draft Drizzle tables cover goals, tasks, and operations. Database access is not wired
to the API or worker. Extend the schema for policy snapshots, recipients, plans,
locking, recovery, and audit events during implementation.

From the repository root:

```sh
npm run db:generate
npm run db:migrate
```

Generate migrations after reviewing the schema. Migration execution needs a real
`DATABASE_URL` in this workspace's `.env`. Keep it out of the web application.
