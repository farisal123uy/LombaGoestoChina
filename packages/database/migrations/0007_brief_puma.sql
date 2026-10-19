ALTER TABLE "provider_databases" ADD COLUMN "ready" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_databases" ADD COLUMN "activated_by_transaction" text;