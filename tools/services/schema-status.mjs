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
    ('goals','tasks','operations','payment_tasks','payment_attempts','execution_locks','worker_controls','provider_invoices','provider_databases')
    ORDER BY tablename`;
  console.log(JSON.stringify({ applicationTables: rows }, null, 2));
} catch {
  console.error("DATABASE_SCHEMA_CHECK_FAILED");
  process.exitCode = 1;
} finally { if (sql) await sql.end({ timeout: 1 }); }
