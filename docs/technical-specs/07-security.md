# Security

## Foundation Controls

- Environment variables are parsed through `@axentra/config`.
- Web receives only `VITE_*` browser-safe values.
- Structured logs redact credentials, authorization headers, signed URLs, and document content.
- Storage object keys are validated before access.
- Production S3 bucket creation is not performed by application code.
- API errors use stable technical codes and safe user-facing messages.
- Queue payloads must not contain document contents.

## Required Future Controls

Authentication, RBAC, upload, preview, download, audit, OCR, AI, and search require a security
review before implementation.

| Concern             | Required Decision                                                 |
| ------------------- | ----------------------------------------------------------------- |
| Auth                | Token strategy, session storage, refresh policy                   |
| RBAC                | Member Team and Head of Team role matrix                          |
| Upload              | File size, MIME allowlist, malware scan path, object key strategy |
| Duplicate detection | Content hash strategy and collision handling                      |
| Download            | Category permission check, signed URL TTL, download audit record  |
| OCR and AI          | Data classification, provider boundary, extracted-text retention  |
| Audit               | Immutable download event structure                                |

## Logging Rules

Never log:

- Passwords or secrets.
- Authorization headers.
- Signed URLs.
- Raw document contents.
- Full OCR text.
- Production credentials.
