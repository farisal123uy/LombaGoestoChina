import { taskStatuses } from "@guardian-wallet/shared";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { EscrowActionAttempt, PaymentTask, PaymentAttempt } from "@guardian-wallet/shared";

export const taskStatusEnum = pgEnum("task_status", taskStatuses);

export const goals = pgTable("goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerAddress: text("owner_address").notNull(),
  chainId: integer("chain_id").notNull(),
  instruction: text("instruction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  goalId: uuid("goal_id").notNull().references(() => goals.id),
  status: taskStatusEnum("status").default("draft").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  policyVersion: text("policy_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const operations = pgTable("operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  chainId: integer("chain_id").notNull(),
  status: taskStatusEnum("status").default("draft").notNull(),
  userOperationHash: text("user_operation_hash"),
  transactionHash: text("transaction_hash"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const paymentTasks = pgTable("payment_tasks", {
  id: uuid("id").primaryKey(),
  accountKey: text("account_key").notNull(),
  ownerAddress: text("owner_address").notNull(),
  paymentId: text("payment_id").notNull().unique(),
  payload: jsonb("payload").$type<PaymentTask>().notNull(),
  status: text("status").notNull(),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("payment_task_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`)]).enableRLS();
export const paymentAttempts = pgTable("payment_attempts", {
  taskId: uuid("task_id").primaryKey().references(() => paymentTasks.id),
  accountKey: text("account_key").notNull(),
  status: text("status").notNull(),
  record: jsonb("record").$type<PaymentAttempt>().notNull(),
  signedPayload: text("signed_payload").notNull(),
}, (table) => [uniqueIndex("one_active_attempt_per_account").on(table.accountKey).where(sql`${table.status} NOT IN ('confirmed','failed')`), check("payment_attempt_record_object", sql`jsonb_typeof(${table.record}) = 'object'`)]).enableRLS();
export const paymentAttemptMembers = pgTable("payment_attempt_members", {
  taskId: uuid("task_id").primaryKey().references(() => paymentTasks.id),
  attemptTaskId: uuid("attempt_task_id").notNull().references(() => paymentAttempts.taskId),
}, (t) => [index("batch_members_by_attempt").on(t.attemptTaskId)]).enableRLS();
export const escrowOperations = pgTable("escrow_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => paymentTasks.id),
  accountKey: text("account_key").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  record: jsonb("record").$type<EscrowActionAttempt>().notNull(),
  signedPayload: text("signed_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("one_active_escrow_operation_per_task").on(t.taskId).where(sql`${t.status} NOT IN ('confirmed','failed')`),
  index("escrow_operations_by_task").on(t.taskId, t.createdAt),
  check("escrow_operation_record_object", sql`jsonb_typeof(${t.record}) = 'object'`),
]).enableRLS();
export const executionLocks = pgTable("execution_locks", {
  accountKey: text("account_key").primaryKey(), workerId: text("worker_id").notNull(),
  fence: bigint("fence", { mode: "bigint" }).notNull(), leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
}).enableRLS();
export const workerControls = pgTable("worker_controls", {
  accountKey: text("account_key").primaryKey(), paused: boolean("paused").notNull().default(true),
}).enableRLS();

export const providerInvoices = pgTable("provider_invoices", {
  invoiceId: text("invoice_id").primaryKey(), accountKey: text("account_key").notNull(), requestId: uuid("request_id").notNull(),
  payload: jsonb("payload").notNull(),
}, (t) => [uniqueIndex("provider_request_idempotency").on(t.accountKey, t.requestId), check("provider_invoice_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`)]).enableRLS();
export const providerDatabases = pgTable("provider_databases", {
  namespaceId: uuid("namespace_id").primaryKey(), invoiceId: text("invoice_id").notNull().unique().references(() => providerInvoices.invoiceId),
  payload: jsonb("payload").notNull(), data: jsonb("data").notNull().default({}),
  probeCount: integer("probe_count").notNull().default(0), lastProbeId: uuid("last_probe_id"),
  ready: boolean("ready").notNull().default(true), activatedByTransaction: text("activated_by_transaction"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [check("provider_database_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`), check("provider_database_data_object", sql`jsonb_typeof(${t.data}) = 'object'`)]).enableRLS();
