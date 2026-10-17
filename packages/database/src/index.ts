import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export * from "./payment-store.js";
export * from "./provider-store.js";

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
