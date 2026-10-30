# Coding Standard

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Enforced

---

## Table of Contents

1. [General Principles](#1-general-principles)
2. [TypeScript Standards](#2-typescript-standards)
3. [Backend Standards: Hono + Bun](#3-backend-standards-hono--bun)
4. [Frontend Standards: React + MVP](#4-frontend-standards-react--mvp)
5. [Database Standards: Drizzle ORM](#5-database-standards-drizzle-orm)
6. [Storage, Queue, and Processing](#6-storage-queue-and-processing)
7. [Testing Standards](#7-testing-standards)
8. [Git Workflow](#8-git-workflow)
9. [File and Folder Naming](#9-file-and-folder-naming)
10. [Code Formatting](#10-code-formatting)
11. [Localization and User-Facing Copy](#11-localization-and-user-facing-copy)
12. [Axentra DMS Business Rules](#12-axentra-dms-business-rules)

---

## 1. General Principles

- Write code for the next developer.
- Prefer explicit over implicit. No hidden side effects. No magic configuration.
- Each function, file, or module does one thing.
- Comments explain why, not what.
- No dead code in task branches, `dev`, or `main`.
- No `// @ts-ignore`.
- No `any`.
- No production file exceeds 300 lines. Split at 250 lines proactively.
- The source of truth is the approved docs: `docs/business/`, `docs/api-specs/`, and
  `docs/technical-specs/`.
- A feature is not complete unless the backend guarantee exists. UI-only permission hiding is not
  authorization.

## 2. TypeScript Standards

### 2.1 Compiler Settings

The workspace uses strict TypeScript. New packages and apps must inherit the root strict settings.

Required expectations:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 2.2 Rules

- No `any`. Use `unknown` and narrow with a type guard.
- No unsafe `as` casts. If a cast is unavoidable at a boundary, isolate it and validate first.
- No non-null assertions.
- Exported functions require explicit return types.
- `type` for data shapes. `interface` only for extensible contracts.
- Enum-like values are string literal unions or Zod enums, never TypeScript `enum`.
- Use `import type` for type-only imports.
- Zod schemas are the source of truth for runtime validation.
- Derive TypeScript types via `z.infer<>` where a Zod schema exists.

Example:

```typescript
import type { LivenessData } from "@axentra/shared";
import { livenessDataSchema } from "@axentra/shared";
```

`@axentra/shared` holds browser-safe cross-process contracts only. Server-only schemas, repository
types, and provider-specific types stay inside the owning app or package.

## 3. Backend Standards: Hono + Bun

### 3.1 Module Structure

Backend API modules live under `apps/api/src/modules/<module>/`.

Use this structure for new business modules:

```text
apps/api/src/modules/<module>/
  <module>.routes.ts
  <module>.handler.ts
  <module>.service.ts
  <module>.repository.ts
  <module>.schema.ts
  <module>.test.ts
```

For larger modules, split by endpoint only when the root module file would exceed the file-size
limits:

```text
apps/api/src/modules/documents/
  documents.routes.ts
  documents.schema.ts
  upload/
    upload.handler.ts
    upload.service.ts
    upload.schema.ts
    upload.test.ts
```

### 3.2 Handler Pattern

Handlers:

- Read Hono context and path/query/body inputs.
- Validate inputs with Zod.
- Call exactly one service function.
- Return response helpers only.
- Do not contain business rules.
- Do not call Drizzle directly.

Example:

```typescript
export function createUploadHandler(dependencies: UploadDependencies) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsed = uploadRequestSchema.safeParse(await context.req.parseBody());
    if (!parsed.success) {
      return jsonError(context, "VALIDATION_ERROR", "Data tidak valid", 400);
    }

    const data = await uploadDocumentService(dependencies, parsed.data);
    return jsonSuccess(context, data, 201);
  };
}
```

### 3.3 Service Pattern

Services:

- Take already-validated input.
- Own business rules and orchestration.
- Own transaction boundaries.
- Call repositories for database access.
- Call storage/queue through provider-neutral ports.
- Throw domain errors, never raw transport responses.
- Never accept Hono `Context`.
- Never return raw `Response`.

Example:

```typescript
export async function uploadDocumentService(
  dependencies: UploadDependencies,
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  return await dependencies.database.transaction(async (tx) => {
    await assertSupportedDocumentType(input.file);
    await assertNotDuplicate(tx, input.contentHash);

    const document = await dependencies.documentsRepository.insert(tx, input);
    await dependencies.storage.putObject({
      key: document.objectKey,
      body: input.bytes,
      contentType: input.contentType,
    });

    await dependencies.processingQueue.enqueueDocumentProcessing({
      documentId: document.id,
      version: 1,
    });

    return { documentId: document.id, status: "accepted" };
  });
}
```

### 3.4 Repository Pattern

Repositories:

- Own every Drizzle query for the module.
- Accept an optional transaction/client parameter.
- Return typed domain rows or DTOs.
- Do not call services.
- Do not perform authorization checks.
- Do not call storage, queue, OCR, or AI providers.

### 3.5 API Envelope

All responses use the shared API envelope:

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data tidak valid"
  }
}
```

Rules:

- Error codes are English and stable.
- User-facing messages are Bahasa Indonesia.
- List endpoints are paginated or capped.
- Endpoint behavior must match `docs/api-specs/`.

### 3.6 Environment Variables

- API and Worker configuration comes from `@axentra/config`.
- Web configuration comes from `@axentra/config/web`.
- Do not read `Bun.env` or `process.env` in feature or business modules.
- Allowed exceptions: config loaders, CLIs, migration config, and tests.

### 3.7 Async Discipline

- Use `async` / `await`.
- Avoid `.then()` chains.
- No silent fire-and-forget operations.
- Detached work must log errors and must not hide user-visible failure.

## 4. Frontend Standards: React + MVP

### 4.1 MVP Layout

Every feature follows API -> Presenter -> View:

```text
apps/web/src/features/<feature>/
  <feature>.api.ts
  <feature>.presenter.ts
  <feature>.view.tsx
```

Responsibilities:

| File                     | Responsibility                                           |
| ------------------------ | -------------------------------------------------------- |
| `<feature>.api.ts`       | API client calls and transport mapping                   |
| `<feature>.presenter.ts` | Query, form orchestration, derived state, event handlers |
| `<feature>.view.tsx`     | JSX rendering only                                       |

### 4.2 Component Rules

- One primary component per file.
- Component names use `PascalCase`.
- Props type is explicitly named `{ComponentName}Props`.
- No prop spreading outside documented low-level wrappers.
- No raw `fetch` in views.
- No Zod parsing in views.
- Avoid nested ternaries; use early returns.

### 4.3 State Management

- Component-local state: `useState`.
- Server state: TanStack Query.
- Forms: React Hook Form and Zod.
- Feature orchestration: presenter hooks.
- Do not introduce Redux, Zustand, Jotai, or another state library without a documented need.

### 4.4 API Client

All Web API calls go through `apps/web/src/lib/api-client.ts`.

Rules:

- Do not call `fetch` directly from a view.
- Do not hardcode `/api/v1` outside the centralized client/config.
- Handle timeout and JSON envelope errors consistently.
- Surface recoverable failures to presenters so views can render retry states.

### 4.5 UI States

Every user-facing feature handles:

- Loading.
- Empty.
- Error.
- Retry.
- Success.
- Disabled or permission-denied actions.

## 5. Database Standards: Drizzle ORM

### 5.1 Schema Conventions

- Table names: plural `snake_case`.
- Column names: `snake_case`.
- Primary key: UUID.
- Mutable tables: `created_at`, `updated_at`.
- Point-in-time records: `timestamptz`.
- Calendar-only values: `date`.
- Identifiers and table/column names are English.

### 5.2 Axentra Domain Table Expectations

When the BA scope is implemented, table design must support:

- Documents.
- Stored file/object references.
- Extracted metadata.
- Content hash for duplicate detection.
- Processing status.
- Smart Tags.
- Categories.
- Category download permissions.
- Download audit events.

### 5.3 Migrations

- All schema changes go through Drizzle migrations.
- Migration files are committed.
- Migration names are descriptive.
- Applied shared migrations are immutable.
- Rebase before generating a migration.
- Run `bun run db:generate` only once, immediately before marking the PR ready.
- Run `bun run db:migrate` on a clean local database.

### 5.4 Transactions

Use transactions for:

- Multi-table document creation.
- Upload record plus metadata changes.
- Category permission mutations.
- Download audit writes tied to download authorization.
- Any operation that must be atomic from a business perspective.

## 6. Storage, Queue, and Processing

### 6.1 Storage

- Domain code depends on `StorageAdapter`.
- Domain code does not import AWS SDK types.
- Object keys are server-generated.
- Object keys are validated before access.
- Signed URL TTL is bounded.
- Local MinIO behavior and production S3-compatible behavior stay provider-neutral.
- Production bucket creation is not performed by application code.

### 6.2 Queue

- Queue payloads are versioned.
- Queue payloads contain identifiers and object keys, not raw document contents.
- Queue jobs must be safe to retry.
- Worker shutdown remains bounded.
- Worker logs include job ID.

### 6.3 OCR and AI Processing

- OCR/AI provider integration must sit behind an internal port.
- Extracted metadata is stored separately from raw document content.
- Full OCR text is not logged.
- Smart Tags are capped according to BA acceptance criteria.
- Provider choice, retention, and data classification must be reviewed before production use.

## 7. Testing Standards

### 7.1 Approach

- Backend tests are required for new business logic.
- Frontend tests are required when presenter logic is complex.
- Unit tests cover happy path and every error branch.
- Integration tests cover infrastructure boundaries when changed.

### 7.2 Structure

- Arrange-Act-Assert.
- One test per distinct error condition.
- Test names describe behavior, not implementation details.
- Tests are isolated and reset state or mocks.

### 7.3 Required Coverage by Feature

- Upload: supported type, unsupported type, storage failure.
- Duplicate detection: duplicate and non-duplicate paths.
- Metadata extraction: present and missing metadata.
- Search: found, empty, and filter behavior.
- Download: allowed, denied, expired signed URL, audit write.
- Category permission: inactive default and Head of Team toggle.

## 8. Git Workflow

### 8.1 Branch Naming

```text
<LAYER>-<SPRINT>-<NN>-<Imperative-kebab-title>

Examples: `BE-S1-01-Implement-auth-prerequisite`,
`FE-S2-05-Build-related-documents-section`, and `DB-S1-01-Create-document-core-schema`.
```

### 8.2 Commit Messages

Use Conventional Commits:

```text
<type>(<scope>): <subject>
```

Allowed types:

- `feat`
- `fix`
- `refactor`
- `test`
- `docs`
- `chore`
- `perf`

Rules:

- Imperative mood.
- Subject is concise.
- Reference task ID when applicable, for example `[BE-S1-03]`.
- Never add `Co-Authored-By` trailers automatically.

### 8.3 Pull Requests

- Normal task work targets `dev`.
- `main` is the primary branch and is used only for Arya's release promotion PRs.
- Direct pushes to protected branches are prohibited.
- Run `bun run complete-check` before review.
- Self-review against [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md).

## 9. File and Folder Naming

| Item                  | Convention                                              | Example                            |
| --------------------- | ------------------------------------------------------- | ---------------------------------- |
| Folders               | `kebab-case`                                            | `platform-status/`                 |
| TypeScript files      | `kebab-case`                                            | `documents.service.ts`             |
| React view files      | `kebab-case` + `.view.tsx`                              | `document-list.view.tsx`           |
| Presenter files       | `kebab-case` + `.presenter.ts`                          | `document-list.presenter.ts`       |
| API files             | `kebab-case` + `.api.ts`                                | `document-list.api.ts`             |
| Test files            | Source name + `.test.ts`                                | `documents.service.test.ts`        |
| Constants             | `camelCase` or `SCREAMING_SNAKE_CASE` when truly global | `maxUploadSizeBytes`               |
| Variables/functions   | `camelCase`                                             | `uploadDocument`                   |
| Types                 | `PascalCase`                                            | `UploadDocumentInput`              |
| Zod schemas           | `camelCase` + `Schema`                                  | `uploadDocumentSchema`             |
| DB table objects      | `camelCase`, plural                                     | `documents`, `downloadAuditEvents` |
| Environment variables | `SCREAMING_SNAKE_CASE`                                  | `DATABASE_URL`                     |

All code identifiers are English. UI labels are Bahasa Indonesia.

## 10. Code Formatting

- Formatter: `oxfmt`.
- Linter: `oxlint`.
- Type checker: `tsc`.
- Test runner: `bun test`.
- Pre-commit hook uses Husky and lint-staged.

Required local gate:

```powershell
bun run complete-check
```

Individual gates:

```powershell
bun run type-check
bun run lint
bun run fmt
bun run test
bun run build
```

## 11. Localization and User-Facing Copy

- UI strings are Bahasa Indonesia.
- Technical identifiers are English.
- API error `code` is English.
- API error `message` is Bahasa Indonesia.
- Dates use `id-ID`.
- File sizes use readable units.
- Use BA-approved wording for acceptance-copy-critical messages.

Required BA copy:

| Situation        | Copy                             |
| ---------------- | -------------------------------- |
| Upload accepted  | `File diterima untuk diproses`   |
| Unsupported type | `Tipe file tidak didukung`       |
| Duplicate file   | `File ini sudah ada`             |
| Empty search     | `Tidak ada hasil yang ditemukan` |

## 12. Axentra DMS Business Rules

These rules come from the BA workbook and related Axentra docs.

### 12.1 Upload

- Member Team can upload one or many documents.
- PDF is supported for the single-file upload AC.
- Multiple DOCX upload is supported for the multi-file AC.
- Unsupported image files such as `.JPG` are rejected.
- Upload acceptance does not mean processing completed.

### 12.2 Duplicate Detection

- Duplicate detection is content-based, not filename-only.
- Duplicate uploads show `File ini sudah ada`.
- Duplicate uploads do not create a new document record.
- Non-duplicate uploads continue even when other files already exist.

### 12.3 Metadata, Smart Tags, and Categories

- Metadata such as author is extracted automatically when available.
- Smart Tags are generated by system processing.
- Maximum visible Smart Tags per document is 3.
- Top Tags update when a new relevant tag appears.
- Auto-created categories default to download permission inactive.

### 12.4 Search and Related Documents

- Search covers title and content where the card requires it.
- Results show filename and matching snippet.
- Search target is less than 3 seconds.
- Related documents share at least one Smart Tag with the current document.

### 12.5 Preview and Download

- Preview must not trigger original file download.
- Download requires server-side category permission.
- Bulk download produces one `.zip`.
- Every successful download writes an audit event.

### 12.6 Head of Team Controls

- Analytics shows total documents and uploads in the last 7 days.
- Audit Trail shows who downloaded what and when.
- Permission Category controls Member Team download access by category.
