CREATE TABLE "account_status_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"user_email" text,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text,
	"actor_email" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_status_audit_events_previous_status_check" CHECK ("account_status_audit_events"."previous_status" in ('active', 'inactive')),
	CONSTRAINT "account_status_audit_events_new_status_check" CHECK ("account_status_audit_events"."new_status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "account_status_audit_events" ADD CONSTRAINT "account_status_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_status_audit_events" ADD CONSTRAINT "account_status_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_status_audit_events_user_id_idx" ON "account_status_audit_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_status_audit_events_actor_user_id_idx" ON "account_status_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "account_status_audit_events_changed_at_idx" ON "account_status_audit_events" USING btree ("changed_at");