import postgres from "postgres";
import * as schema from "./schema.js";
export * from "./schema.js";
export declare function createDatabase(connectionString: string): {
    db: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
        $client: postgres.Sql<{}>;
    };
    close: () => Promise<void>;
};
//# sourceMappingURL=index.d.ts.map