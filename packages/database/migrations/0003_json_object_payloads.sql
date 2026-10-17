-- Recover encoded JSON strings written by the previous postgres.js binding.
-- Object rows remain untouched. Invalid/non-object legacy data fails migration
-- rather than being silently replaced; all statements run in one transaction.
UPDATE "payment_attempts" SET "record"=("record" #>> '{}')::jsonb WHERE jsonb_typeof("record")='string';--> statement-breakpoint
UPDATE "payment_tasks" SET "payload"=("payload" #>> '{}')::jsonb WHERE jsonb_typeof("payload")='string';--> statement-breakpoint
UPDATE "provider_databases" SET "payload"=("payload" #>> '{}')::jsonb WHERE jsonb_typeof("payload")='string';--> statement-breakpoint
UPDATE "provider_databases" SET "data"=("data" #>> '{}')::jsonb WHERE jsonb_typeof("data")='string';--> statement-breakpoint
UPDATE "provider_invoices" SET "payload"=("payload" #>> '{}')::jsonb WHERE jsonb_typeof("payload")='string';--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempt_record_object" CHECK (jsonb_typeof("payment_attempts"."record") = 'object');--> statement-breakpoint
ALTER TABLE "payment_tasks" ADD CONSTRAINT "payment_task_payload_object" CHECK (jsonb_typeof("payment_tasks"."payload") = 'object');--> statement-breakpoint
ALTER TABLE "provider_databases" ADD CONSTRAINT "provider_database_payload_object" CHECK (jsonb_typeof("provider_databases"."payload") = 'object');--> statement-breakpoint
ALTER TABLE "provider_databases" ADD CONSTRAINT "provider_database_data_object" CHECK (jsonb_typeof("provider_databases"."data") = 'object');--> statement-breakpoint
ALTER TABLE "provider_invoices" ADD CONSTRAINT "provider_invoice_payload_object" CHECK (jsonb_typeof("provider_invoices"."payload") = 'object');
