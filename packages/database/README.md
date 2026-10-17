# Database workspace

The original goals/tasks/operations tables remain for compatibility. The implemented
payment path uses separate payment_tasks, payment_attempts, execution_locks and
worker_controls. API and worker share the PostgreSQL PaymentStore. Tasks and attempt
states are separate; the partial unique index allows one active attempt per account.
Generated migrations `0000_silent_storm.sql` and `0001_thankful_stranger.sql` are
applied on hosted Supabase and in PGlite tests. All internal tables enable RLS with
no public-role policies; the server DB role remains privileged. Hosted multi-process
and pooler stress still require verification.

From the repository root:

```sh
npm run db:generate
npm run db:migrate
```

Generate migrations after reviewing the schema. Migration execution needs a real
`DATABASE_URL` in this workspace's `.env`. Keep it out of the web application.
