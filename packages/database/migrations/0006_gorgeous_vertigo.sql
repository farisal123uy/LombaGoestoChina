CREATE TABLE "escrow_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"account_key" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"record" jsonb NOT NULL,
	"signed_payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_operation_record_object" CHECK (jsonb_typeof("escrow_operations"."record") = 'object')
);
--> statement-breakpoint
ALTER TABLE "escrow_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "escrow_operations" ADD CONSTRAINT "escrow_operations_task_id_payment_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."payment_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_escrow_operation_per_task" ON "escrow_operations" USING btree ("task_id") WHERE "escrow_operations"."status" NOT IN ('confirmed','failed');--> statement-breakpoint
CREATE INDEX "escrow_operations_by_task" ON "escrow_operations" USING btree ("task_id","created_at");