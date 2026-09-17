# Data Model

Foundation v0.1.0 intentionally contains no business tables.

The current schema entrypoint is:

```text
packages/db/src/schema/index.ts
```

It exports no tables until a reviewed sprint task introduces the first domain schema.

## Implemented Database Boundary

| Concern           | Status      |
| ----------------- | ----------- |
| PostgreSQL client | Implemented |
| Drizzle boundary  | Implemented |
| Migration runner  | Implemented |
| Health check      | Implemented |
| Business tables   | Deferred    |

## Future Table Rules

- Table names use plural `snake_case`.
- Columns use `snake_case`.
- Primary keys use UUID.
- Timestamps use `timestamptz`.
- Soft delete, ownership, category permission, duplicate hash, processing status, and audit
  requirements must be decided before domain tables are added.
- Applied shared migrations are immutable; use a forward migration for fixes.

## Planned Domain Areas

| Area                | Example Entities                                     |
| ------------------- | ---------------------------------------------------- |
| Identity            | users, sessions, roles                               |
| Document core       | documents, document_files, document_metadata         |
| Duplicate detection | document_content_hashes                              |
| Processing          | processing_jobs, ocr_results, smart_tags, categories |
| Search              | search_index_entries, related_document_links         |
| Permission          | category_download_permissions                        |
| Audit               | download_audit_events                                |
| Analytics           | derived summary queries or materialized views        |
