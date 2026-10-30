CREATE TABLE "download_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"user_email" text,
	"document_id" uuid,
	"document_name" text NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "download_audit_events" ADD CONSTRAINT "download_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_audit_events" ADD CONSTRAINT "download_audit_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "download_audit_events_user_id_idx" ON "download_audit_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "download_audit_events_document_id_idx" ON "download_audit_events" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "download_audit_events_downloaded_at_idx" ON "download_audit_events" USING btree ("downloaded_at");