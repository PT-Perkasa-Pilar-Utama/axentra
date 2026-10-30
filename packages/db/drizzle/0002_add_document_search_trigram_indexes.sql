CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
ALTER TABLE "document_metadata" ADD COLUMN IF NOT EXISTS "extracted_text" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_files_original_name_trgm_idx" ON "document_files" USING gin ("original_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_metadata_extracted_text_trgm_idx" ON "document_metadata" USING gin ("extracted_text" gin_trgm_ops);