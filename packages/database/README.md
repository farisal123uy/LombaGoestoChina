# Database workspace

The original goals/tasks/operations tables remain for compatibility. The implemented
payment path uses separate payment_tasks, payment_attempts, execution_locks and
worker_controls. API and worker share the PostgreSQL PaymentStore. Tasks and attempt
states are separate; the partial unique index allows one active attempt per account.
Migrations **0000–0007** are applied in isolated PGlite/fork tests. They include
provider invoices/namespaces, JSON-object constraints, batch attempt membership and
escrow operation journals/staged access. The original hosted checkpoint was migrated
through 0003; inspect its migration status before rollout. All internal tables enable RLS with
no public-role policies; the server DB role remains privileged. Hosted multi-process
and pooler stress still require verification.

From the repository root:

```sh
npm run db:generate
npm run db:migrate
```

Generate migrations after reviewing the schema. Migration execution needs a real
`DATABASE_URL` in this workspace's `.env`. Keep it out of the web application.
