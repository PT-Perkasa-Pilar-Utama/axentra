# Code Review Checklist

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Enforced

---

Every pull request must satisfy this checklist before Arya Isnaidi (Tech Lead) approves. Developers run it as
self-review before requesting review. When a rule changes, update this file and
[CODING_STANDARD.md](CODING_STANDARD.md); nowhere else.

## General

- [ ] PR is scoped to a single task card or user story. No unrelated changes bundled in.
- [ ] PR description explains what changed, why, and how to test it.
- [ ] Task ID, user story, sprint, and AC IDs are listed.
- [ ] PR references the authoritative docs: `docs/TASK_BREAKDOWN.md`, `docs/api-specs/`, and
      `docs/business/acceptance-criteria.md`.
- [ ] No commented-out code unless a clear reason is given.
- [ ] `TODO` includes the blocking task ID: `// TODO(<TASK-ID>): ... blocked on <TASK-ID>`.
- [ ] No hardcoded credentials, secrets, local absolute paths, URLs, or magic numbers without
      named constants.
- [ ] Dead imports and unused variables removed.
- [ ] No production file exceeds 300 lines. Files past 250 lines are split proactively.
- [ ] No placeholder stubs shipped as complete. Foundation-only scaffolds must be clearly marked.
- [ ] No duplicated utilities. Shared helpers are reused instead of re-implemented.
- [ ] CI-equivalent local gate is green: `bun run complete-check`.

## TypeScript

- [ ] No `any`. Use `unknown` with narrowing when input type is unknown.
- [ ] No unsafe `as` type casts.
- [ ] No `!` non-null assertions.
- [ ] All exported functions have explicit return types.
- [ ] Zod schemas are the source of truth for runtime input validation.
- [ ] Types are derived with `z.infer<>` where a Zod schema exists.
- [ ] No `// @ts-ignore`.
- [ ] String literal unions or Zod enums used instead of TypeScript `enum`.
- [ ] `type` for data shapes; `interface` only for intentional extensible contracts.

## Backend: Hono + Bun

### Structure

- [ ] Handler contains HTTP translation only: context access, validation, service call, response.
- [ ] Business logic is in the service layer.
- [ ] All Drizzle queries live in repository modules. No Drizzle access from handlers or views.
- [ ] Services and repositories use standalone exported functions. No classes unless justified.
- [ ] No raw `Bun.env` or `process.env` in feature or business modules. Use `@axentra/config`.
- [ ] Exceptions are limited to config loaders, CLIs, migration config, and tests.
- [ ] New modules follow the documented shape in `docs/technical-specs/03-repository-structure.md`.

### API Design

- [ ] Endpoint path matches the relevant file in `docs/api-specs/`.
- [ ] HTTP status codes match `docs/api-specs/01-conventions.md`.
- [ ] All responses use `{ success: true, data }` or `{ success: false, error }`.
- [ ] All inputs are validated before reaching the service.
- [ ] List endpoints are paginated or capped.
- [ ] Error codes are stable English identifiers; user-facing messages are Bahasa Indonesia.
- [ ] Deviations from the API spec are called out in the PR description and docs are updated.

### Axentra DMS Business Rules

- [ ] Upload accepts only approved document types for the card scope.
- [ ] Unsupported file types return the approved copy, for example `Tipe file tidak didukung`.
- [ ] Duplicate detection checks file content, not only filename.
- [ ] Duplicate uploads do not persist a new document record or object.
- [ ] Metadata extraction results are stored separately from raw document content.
- [ ] Smart Tags are capped at 3 visible tags per document unless BA updates the AC.
- [ ] Auto-created categories default to download permission inactive.
- [ ] Search covers title and extracted content where required by the card.
- [ ] Related documents share at least one Smart Tag with the active document.
- [ ] Bulk download validates permissions for every selected document.

### Security

- [ ] New protected endpoints enforce server-side authorization.
- [ ] Member Team and Head of Team behavior matches `docs/technical-specs/09-authentication.md`.
- [ ] Category download permission is checked server-side before single or bulk download.
- [ ] File upload endpoints enforce MIME type, extension, and size limit.
- [ ] Object keys are server-generated and validated.
- [ ] Sensitive data is never logged or returned: passwords, auth tokens, signed URLs, document
      contents, full OCR text, secrets.
- [ ] OCR/AI provider integration does not bypass data classification and retention decisions.
- [ ] Production bucket creation is not performed by application code.

### Error Handling

- [ ] Domain errors use shared application error helpers instead of raw `Error`.
- [ ] No empty `catch` blocks or `catch` blocks that discard the error.
- [ ] All async operations are awaited.
- [ ] Fire-and-forget work has explicit error logging and does not hide user-visible failure.
- [ ] Multi-table writes are wrapped in a transaction.
- [ ] Upload, processing, and download failures leave records in a recoverable state.

### Audit and Observability

- [ ] Every successful document download writes an audit event with user, document, and timestamp.
- [ ] Mutations that affect document access or category permission write audit events.
- [ ] Audit entries do not store document contents or full OCR text.
- [ ] API logs include request ID.
- [ ] Worker logs include job ID.
- [ ] Queue payloads carry identifiers and versioned payloads, never document contents.

## Frontend: React + MVP

### MVP Structure

- [ ] Feature shape follows API -> Presenter -> View.
- [ ] View files contain JSX only. No `fetch`, no business logic, no Zod parsing.
- [ ] Presenters own Query, form orchestration, derived state, effects, and handlers.
- [ ] API calls go through the centralized API client, not raw `fetch`.
- [ ] Server state uses TanStack Query.
- [ ] Forms use React Hook Form and Zod when forms are introduced.

### UI Behavior

- [ ] Loading states handled with skeleton, spinner, or disabled pending state.
- [ ] Error states handled and displayed in Bahasa Indonesia.
- [ ] Empty states handled, including `Tidak ada hasil yang ditemukan`.
- [ ] Retry states exist for recoverable API failures.
- [ ] Icon-only buttons have `aria-label`.
- [ ] Disabled buttons have clear reason through title, tooltip, or nearby text.
- [ ] User-facing strings are Bahasa Indonesia.
- [ ] Dates use `id-ID` locale.
- [ ] File sizes and counts are formatted consistently.

### Axentra DMS UI Rules

- [ ] Upload UI handles one PDF, multiple DOCX, unsupported JPG, duplicate, accepted, processing,
      and failed states.
- [ ] Recent documents refresh after upload processing completes.
- [ ] Document detail shows extracted metadata such as author when available.
- [ ] Smart Tags are visible on processed documents with a maximum of 3 visible tags.
- [ ] Active tag filters are visually highlighted.
- [ ] Search result cards show filename and matching text snippet.
- [ ] Preview opens without triggering a download.
- [ ] Download actions are hidden or disabled when category permission denies access.
- [ ] Bulk download UI clearly shows selected documents and starts one `.zip` download.
- [ ] Head of Team pages show analytics, audit trail, and category permission controls only to
      authorized users.

## Database

- [ ] Schema change is made through Drizzle migration, not manual SQL.
- [ ] Migration file is named descriptively.
- [ ] `_journal.json` is updated when migrations are generated.
- [ ] New tables use plural `snake_case`.
- [ ] Columns use `snake_case`.
- [ ] Primary keys use UUID.
- [ ] Mutable tables include `created_at` and `updated_at`.
- [ ] Foreign keys are declared where ownership is required.
- [ ] Indexes exist for frequent `WHERE`, `ORDER BY`, content hash, category, tag, and audit
      lookup columns.
- [ ] Document content hash uniqueness is enforced where duplicate detection requires it.
- [ ] Category download permission default is inactive for auto-created categories.

### Migration Serialization

- [ ] Did not run `bun run db:generate` at the start of the branch.
- [ ] Rebased on the target branch before generating.
- [ ] Ran `bun run db:generate` only once, immediately before marking the PR ready.
- [ ] Ran `bun run db:migrate` on a clean local database.
- [ ] PR describes operational impact for any schema or migration change.

## Storage, Queue, and Processing

- [ ] Storage code depends on `StorageAdapter`, not AWS SDK types in domain code.
- [ ] Local MinIO behavior and production S3-compatible behavior remain provider-neutral.
- [ ] Signed URL TTL is bounded.
- [ ] Upload processing jobs contain document IDs, object keys, and versioned payloads only.
- [ ] Queue jobs do not contain raw file bytes or document contents.
- [ ] Worker shutdown remains bounded.
- [ ] Failed processing jobs can be retried or surfaced to the user without data loss.

## Testing

- [ ] New business logic has unit tests covering happy path and every error branch.
- [ ] Tests follow Arrange-Act-Assert.
- [ ] Tests are isolated and reset mocks or test state.
- [ ] One test per error condition where behavior differs.
- [ ] API contract changes update shared schemas or typed responses.
- [ ] Upload, duplicate detection, permission, and audit logic are tested server-side.
- [ ] Frontend tests are optional unless the card changes complex presenter behavior.

## E2E

End-to-end coverage is planned under `docs/E2E_TESTING.md`. Until the E2E suite exists, PRs must
include manual verification notes for linked ACs.

- [ ] UI navigation tied to an `AC-XX.YY` has either an E2E flow or a documented manual walkthrough.
- [ ] Manual verification includes role used, input data, expected copy, and observed result.
- [ ] No mocked backend is used for acceptance walkthroughs unless explicitly stated as a scaffold.
- [ ] AC coverage table in `docs/E2E_TESTING.md` is updated when E2E coverage is added.

## Git and PR Hygiene

- [ ] Branch name follows `<LAYER>-<SPRINT>-<NN>-<Imperative-kebab-title>`, for example
      `BE-S1-01-Implement-auth-prerequisite` or `FE-S2-05-Build-related-documents-section`.
- [ ] Commit messages follow Conventional Commits.
- [ ] No merge commits. Rebase before PR.
- [ ] No `.env`, credentials, local build output, or generated secrets are staged.
- [ ] `packages/shared` updated when API contracts change.
- [ ] No `Co-Authored-By` trailers.

## Sprint Governance

- [ ] PR references the pre-assigned task ID from `docs/TASK_BREAKDOWN.md`.
- [ ] PR targets the correct branch: `dev` for normal task work, `main` only for Arya's release
      promotion PR.
- [ ] Linked AC coverage is verified by tests or manual walkthrough on the target environment.
- [ ] BA-impacting changes update `docs/business/`, `docs/api-specs/`, and technical specs in the
      same PR.

## Reviewer Sign-Off

Only Arya Isnaidi (Tech Lead) approves a PR. Developer self-review happens before review is requested.

| Reviewer                 | Decision                  | Notes |
| ------------------------ | ------------------------- | ----- |
| Arya Isnaidi (Tech Lead) | Approve / Request Changes |       |
