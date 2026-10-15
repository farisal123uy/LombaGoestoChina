import { taskStatuses } from "@guardian-wallet/shared";
import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
export const taskStatusEnum = pgEnum("task_status", taskStatuses);
export const goals = pgTable("goals", {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerAddress: text("owner_address").notNull(),
    chainId: integer("chain_id").notNull(),
    instruction: text("instruction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const tasks = pgTable("tasks", {
    id: uuid("id").defaultRandom().primaryKey(),
    goalId: uuid("goal_id").notNull().references(() => goals.id),
    status: taskStatusEnum("status").default("draft").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    policyVersion: text("policy_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const operations = pgTable("operations", {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull().references(() => tasks.id),
    chainId: integer("chain_id").notNull(),
    status: taskStatusEnum("status").default("draft").notNull(),
    userOperationHash: text("user_operation_hash"),
    transactionHash: text("transaction_hash"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
//# sourceMappingURL=schema.js.map