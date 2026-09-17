---
name: add-audit-log
description: Add audit evidence for an approved Axentra mutation.
---

# Axentra audit logging

Foundation defines observability and security boundaries; business mutation audit fields are added only for an approved task. When required, write the audit record in the same database transaction as the mutation under packages/db/src.

Record actor/request context, action, entity type/id, timestamp, and a minimal before/after diff. Redact credentials, document content, signed URLs, and personal data. Derive actor, tenant, and branch from trusted server context. Never accept audit identity from a browser body.

Add tests for success, rollback (no audit row), authorization failure, and redaction. Update the relevant API and data-model docs, then run bun run complete-check.
