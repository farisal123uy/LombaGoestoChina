import { readdir, readFile } from "node:fs/promises";

/** Apply the same ordered SQL migration set as deployment in isolated PG tests. */
export async function applyTestMigrations(db: { exec(sql: string): Promise<unknown> }) {
  const folder = new URL("../../packages/database/migrations/", import.meta.url);
  const files = (await readdir(folder)).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
  for (const name of files) await db.exec(await readFile(new URL(name, folder), "utf8"));
}
