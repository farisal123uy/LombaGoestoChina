CREATE TABLE "payment_attempt_members" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"attempt_task_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_attempt_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_attempt_members" ADD CONSTRAINT "payment_attempt_members_task_id_payment_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."payment_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempt_members" ADD CONSTRAINT "payment_attempt_members_attempt_task_id_payment_attempts_task_id_fk" FOREIGN KEY ("attempt_task_id") REFERENCES "public"."payment_attempts"("task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Existing single-invoice attempts retain their identity and private payload.
INSERT INTO "payment_attempt_members" ("task_id","attempt_task_id") SELECT "task_id","task_id" FROM "payment_attempts" ON CONFLICT DO NOTHING;
