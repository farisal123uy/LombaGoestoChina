CREATE TABLE "provider_databases" (
	"namespace_id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"probe_count" integer DEFAULT 0 NOT NULL,
	"last_probe_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_databases_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
ALTER TABLE "provider_databases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_invoices" (
	"invoice_id" text PRIMARY KEY NOT NULL,
	"account_key" text NOT NULL,
	"request_id" uuid NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_tasks" ADD COLUMN "next_action_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_databases" ADD CONSTRAINT "provider_databases_invoice_id_provider_invoices_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."provider_invoices"("invoice_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_request_idempotency" ON "provider_invoices" USING btree ("account_key","request_id");