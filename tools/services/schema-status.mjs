import postgres from "postgres";
import { readEnvironment, verifyProject } from "./config.mjs";

await verifyProject();
const environment = await readEnvironment("database");
if (!environment.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
let sql;
try {
  sql = postgres(environment.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 8 });
  const rows = await sql`SELECT t.tablename, t.rowsecurity,
    (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname=t.schemaname AND p.tablename=t.tablename) AS policy_count
    FROM pg_tables t WHERE t.schemaname='public' AND t.tablename IN
    ('goals','tasks','operations','payment_tasks','payment_attempts','payment_attempt_members','escrow_operations','execution_locks','worker_controls','provider_invoices','provider_databases')
    ORDER BY tablename`;
  const escrow = await sql`SELECT
    to_regclass('public.escrow_operations') IS NOT NULL AS operations_journal,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_databases' AND column_name='ready') AS staged_namespace_readiness,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_databases' AND column_name='activated_by_transaction') AS release_transaction_binding`;
  console.log(JSON.stringify({ applicationTables: rows, escrowSchema: escrow[0] }, null, 2));
} catch {
  console.error("DATABASE_SCHEMA_CHECK_FAILED");
  process.exitCode = 1;
} finally { if (sql) await sql.end({ timeout: 1 }); }
