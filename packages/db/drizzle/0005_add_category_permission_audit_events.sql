CREATE TABLE "category_permission_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"category_name" text NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"user_email" text,
	"previous_download_enabled" boolean,
	"new_download_enabled" boolean NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_permission_audit_events" ADD CONSTRAINT "category_permission_audit_events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_permission_audit_events" ADD CONSTRAINT "category_permission_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_permission_audit_events_category_id_idx" ON "category_permission_audit_events" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "category_permission_audit_events_user_id_idx" ON "category_permission_audit_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "category_permission_audit_events_changed_at_idx" ON "category_permission_audit_events" USING btree ("changed_at");