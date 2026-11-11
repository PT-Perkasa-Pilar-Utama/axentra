CREATE TABLE "admin_document_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"document_title" text NOT NULL,
	"action" text NOT NULL,
	"previous_archived_at" timestamp with time zone,
	"new_archived_at" timestamp with time zone,
	"previous_deleted_at" timestamp with time zone,
	"new_deleted_at" timestamp with time zone,
	"actor_user_id" uuid,
	"actor_name" text,
	"actor_email" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_document_audit_events_action_check" CHECK ("admin_document_audit_events"."action" in ('archive', 'unarchive', 'delete'))
);
--> statement-breakpoint
ALTER TABLE "admin_document_audit_events" ADD CONSTRAINT "admin_document_audit_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_document_audit_events" ADD CONSTRAINT "admin_document_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_document_audit_events_document_id_idx" ON "admin_document_audit_events" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "admin_document_audit_events_actor_user_id_idx" ON "admin_document_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "admin_document_audit_events_changed_at_idx" ON "admin_document_audit_events" USING btree ("changed_at");