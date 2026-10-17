# Migrations

Migrations are applied in order by `npm run db:migrate` using this workspace's
configured DATABASE_URL. Migrations through `0003` were applied to the configured
hosted Supabase database on October 17, 2026. Tests apply the same SQL to PGlite.

- `0000_silent_storm.sql`: scaffold plus tasks, attempts, leases and worker controls.
- `0001_thankful_stranger.sql`: RLS for internal tables.
- `0002_glamorous_prodigy.sql`: provider invoices, service namespaces and delivery
  backoff scheduling. All nine tables have RLS with no public-role policies.
- `0003_json_object_payloads.sql`: repairs legacy encoded JSON strings and adds five
  object-only constraints. Repair and constraints run transactionally; invalid
  legacy content fails migration rather than being silently replaced.

Store parameters are already JSON-encoded strings. SQL binds them through
`::text::jsonb` to prevent postgres.js from serializing a JSON string a second time.
This driver behavior differs from PGlite; the live provider preview exercises actual
hosted invoice persistence in addition to the integration suite.
