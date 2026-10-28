# Security

## Foundation Controls

- Environment variables are parsed through `@axentra/config`.
- Web receives only `VITE_*` browser-safe values.
- Structured logs redact credentials, authorization headers, signed URLs, and document content.
- Storage object keys are validated before access.
- Production S3 bucket creation is not performed by application code.
- API errors use stable technical codes and safe user-facing messages.
- Queue payloads must not contain document contents.

## Implemented Controls

| Concern             | Status      | Implementation                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                | Implemented | Opaque access and refresh tokens. Only their SHA-256 hashes are stored in `auth_sessions`. The refresh cookie is HttpOnly, `SameSite=Lax`, scoped to `/api/v1/auth`, and `Secure` as configured. Refresh tokens rotate, and presenting a rotated token revokes the session. Five failed logins lock the email for 15 minutes. See [09-authentication.md](09-authentication.md). |
| RBAC                | Implemented | `requireRole` on each route. The role matrix is in [09-authentication.md](09-authentication.md).                                                                                                                                                                                                                                                                                |
| Upload              | Partial     | 50 MB per file and 50 MB aggregate upload size (`MAX_DOCUMENT_FILE_SIZE_BYTES`, `MAX_AGGREGATE_UPLOAD_SIZE_BYTES`). MIME allowlist per type (PDF and DOCX). Object keys are generated server-side as `documents/<documentId>/<sanitized name>`. Malware scan is not implemented (see Open Controls).                                                                            |
| Duplicate detection | Implemented | SHA-256 content hash with a unique index on `(content_hash, hash_algorithm)`. The check-duplicate endpoint and the upload path use it.                                                                                                                                                                                                                                          |
| Preview             | Implemented | `GET /documents/:id/preview` returns metadata only. `GET /documents/:id/preview/content` streams bytes through the API with `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`. No storage URL is returned to the browser.                                                                                                |
| Download            | Implemented | The category download permission is checked for `member_team` and re-checked under a row lock inside the audit transaction. Streamed downloads (`stream=true`) return bytes through the API. Otherwise a presigned URL is returned with a TTL between 60 and 900 seconds (default 300, `DEFAULT_DOWNLOAD_TTL_SECONDS`). See [03-documents.md](../api-specs/03-documents.md).    |
| Download audit      | Implemented | A `download_audit_events` row is inserted in the same transaction as the authorization re-check. If the insert fails, the download fails and no content is returned. No code path updates or deletes this table, and no database trigger enforces immutability.                                                                                                                 |
| Search              | Implemented | `%`, `_`, and `\` in search input are escaped before `LIKE` (`search.like.ts`).                                                                                                                                                                                                                                                                                                 |
| OCR and AI          | Open        | No OCR or AI provider is integrated. Extraction is deterministic (PDF `/Author`, DOCX core properties, and keyword and content rules).                                                                                                                                                                                                                                          |

## Open Controls

These controls need a decision or an implementation before the related scope is released.

- **Malware scan path for uploads:** not decided or implemented.
- **OCR and AI provider boundary, data classification, and extracted-text retention:** not decided.
- **Immutable audit events:** enforced only by the absence of update and delete code paths. Decide whether a database trigger or an append-only database role is required.
- **Preview size limit and bulk download memory risk:** both await approver decisions. See [DECISIONS.md](../DECISIONS.md) (B2, F24, and F30).

## Logging Rules

Never log:

- Passwords or secrets.
- Authorization headers.
- Signed URLs.
- Raw document contents.
- Full OCR text.
- Production credentials.
