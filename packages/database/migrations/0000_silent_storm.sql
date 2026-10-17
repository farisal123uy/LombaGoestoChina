CREATE TYPE "public"."task_status" AS ENUM('draft', 'planned', 'authorized', 'submitted', 'confirmed', 'completed', 'needs_owner', 'rejected', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "execution_locks" (
	"account_key" text PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL,
	"fence" bigint NOT NULL,
	"lease_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"instruction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"status" "task_status" DEFAULT 'draft' NOT NULL,
	"user_operation_hash" text,
	"transaction_hash" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"account_key" text NOT NULL,
	"status" text NOT NULL,
	"record" jsonb NOT NULL,
	"signed_payload" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_key" text NOT NULL,
	"owner_address" text NOT NULL,
	"payment_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_tasks_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"status" "task_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "worker_controls" (
	"account_key" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_task_id_payment_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."payment_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_attempt_per_account" ON "payment_attempts" USING btree ("account_key") WHERE "payment_attempts"."status" NOT IN ('confirmed','failed');