import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
export * from "./schema.js";
export function createDatabase(connectionString) {
    const client = postgres(connectionString, { prepare: false });
    return {
        db: drizzle(client, { schema }),
        close: () => client.end(),
    };
}
//# sourceMappingURL=index.js.map