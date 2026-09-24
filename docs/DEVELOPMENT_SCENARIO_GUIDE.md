# Development Scenario Guide

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Draft for Sprint Planning

Concrete walk-throughs for setting up the project, picking up assigned sprint cards, opening PRs,
reviewing work, and promoting Axentra through Test and Production.

---

## Table of Contents

1. [Day 1 Setup](#1-day-1-setup)
2. [Work-Split Model](#2-work-split-model)
3. [Sprint Rhythm](#3-sprint-rhythm)
4. [Picking Up a Backend Card](#4-picking-up-a-backend-card)
5. [Picking Up a Frontend Card](#5-picking-up-a-frontend-card)
6. [Picking Up an Acceptance Verification Card](#6-picking-up-an-acceptance-verification-card)
7. [Arya Isnaidi: Reviewing a PR](#7-arya-isnaidi-reviewing-a-pr)
8. [Arya Isnaidi: Promoting and Releasing](#8-arya-isnaidi-promoting-and-releasing)
9. [Common Scenarios](#9-common-scenarios)

---

## 1. Day 1 Setup

Axentra is a Bun workspace with separate Web, API, Worker, and shared package boundaries.

### 1.1 Local setup

```powershell
Copy-Item .env.example .env
bun install
bun run infra:up
bun run db:migrate
```

Start the three app processes in separate terminals:

```powershell
bun run dev:api
```

```powershell
bun run dev:worker
```

```powershell
bun run dev:web
```

Open the Web shell at `http://localhost:5173`.

Health checks:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
Invoke-RestMethod http://localhost:3001/api/v1/health/ready
```

Expected local services:

| Service       | URL or port             |
| ------------- | ----------------------- |
| Web           | `http://localhost:5173` |
| API           | `http://localhost:3001` |
| PostgreSQL    | `localhost:5432`        |
| Redis         | `localhost:6379`        |
| MinIO API     | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

### 1.2 Reading order

Read these before taking a task:

1. [GLOSSARY.md](GLOSSARY.md).
2. [business/product-overview.md](business/product-overview.md).
3. [business/user-story.md](business/user-story.md) and
   [business/sprint-breakdown.md](business/sprint-breakdown.md).
4. [technical-specs/\_index.md](technical-specs/_index.md).
5. [api-specs/\_index.md](api-specs/_index.md).
6. [CODING_STANDARD.md](CODING_STANDARD.md).
7. [TASK_BREAKDOWN.md](TASK_BREAKDOWN.md).

### 1.3 Baseline verification

Run the full gate before your first PR:

```powershell
bun run complete-check
```

If local Docker services are not running, run:

```powershell
bun run infra:up
bun run db:migrate
```

Then repeat the gate.

---

## 2. Work-Split Model

Cards in [TASK_BREAKDOWN.md](TASK_BREAKDOWN.md) are pre-assigned during sprint planning.
Developers do not pull random backlog items.

| Delivery role           | Team member(s)  | Responsibility                                                                    |
| ----------------------- | --------------- | --------------------------------------------------------------------------------- |
| Tech Lead               | Arya Isnaidi    | Architecture, review, PR/release approval, and acceptance sign-off                |
| Backend                 | Sami            | API, database, worker, storage, and security cards assigned in the task breakdown |
| Frontend                | Azis, Aiman     | Web UI, presenter, and API integration cards assigned in the task breakdown       |
| Acceptance verification | Card PIC + Arya | Evidence against linked ACs; no dedicated QA role                                 |

Foundation v1.0.0 ships:

- Bun workspace and package boundaries.
- React/Vite Web shell.
- Hono API process.
- BullMQ Worker process.
- PostgreSQL, Redis, and MinIO local infrastructure.
- Typed configuration packages.
- Health and readiness endpoints.
- CI, lint, format, tests, and build gate.
- BA-aligned docs.

From Sprint 1 onward:

- Backend and Frontend work in parallel from the approved API contracts.
- Database work lands before API behavior that depends on the schema.
- API contracts are stable unless the PR explicitly updates the docs.
- Frontend does not fake persistence for BA flows.
- Download permissions and audit writes are enforced server-side.
- OCR/AI behavior can start as deterministic processing behind a stable interface until the final
  provider is approved.

---

## 3. Sprint Rhythm

Recommended sprint rhythm:

| Day     | Activity                                                          |
| ------- | ----------------------------------------------------------------- |
| Mon     | Sprint planning. Arya confirms card assignments and dependencies. |
| Mon-Thu | Development, daily check-in, PRs opened against `dev`.            |
| Fri AM  | Card PIC verifies Test against linked ACs; Arya records sign-off. |
| Fri PM  | Sprint Review, Retro, and backlog carry-over decisions.           |

Scope that does not fit moves to the next sprint without silent expansion.

Branch rules:

| Work type         | Branch example                           |
| ----------------- | ---------------------------------------- |
| Backend card      | `BE-S1-02-Implement-document-upload-api` |
| Frontend card     | `FE-S1-01-Build-member-upload-dashboard` |
| Database card     | `DB-S1-01-Create-document-core-schema`   |
| Verification card | `QA-S1-01-Verify-upload-duplicate-flow`  |
| Tech Lead card    | `FND-07-Add-quality-gates`               |
| Fix               | `BE-S1-04-Implement-duplicate-detection` |

Commit message examples:

```text
feat(documents): implement upload API [BE-S1-02]
feat(documents): build member upload dashboard [FE-S1-01]
test(documents): cover duplicate upload flow [QA-S1-01]
fix(documents): enforce duplicate content hash [BE-S1-04]
```

---

## 4. Picking Up a Backend Card

Example card: `BE-S1-02` - Implement document upload API.

```powershell
git checkout dev
git pull origin dev
git checkout -b BE-S1-02-Implement-document-upload-api
```

### 4.1 Read first

Read the relevant sections:

- [api-specs/03-documents.md](api-specs/03-documents.md) `POST /api/v1/documents/upload`.
- [api-specs/01-conventions.md](api-specs/01-conventions.md) response envelope and errors.
- [technical-specs/06-data-model.md](technical-specs/06-data-model.md) document tables.
- [technical-specs/07-security.md](technical-specs/07-security.md) upload and document security.
- [technical-specs/10-integration-points.md](technical-specs/10-integration-points.md) storage and
  processing boundary.
- [business/acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md](business/acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md).

Relevant acceptance criteria:

| AC       | Expectation                                    |
| -------- | ---------------------------------------------- |
| AC-01.01 | Member Team can upload one PDF.                |
| AC-01.02 | Uploaded document appears in recent documents. |
| AC-01.03 | Unsupported `.JPG` file is rejected.           |
| AC-01.04 | Member Team can upload multiple DOCX files.    |

### 4.2 Implement in order

Expected future backend module shape:

```text
apps/api/src/modules/documents/
  documents.routes.ts
  documents.handler.ts
  documents.service.ts
  documents.repository.ts
  documents.schema.ts
  documents.test.ts
```

Recommended implementation order:

1. Add or update database schema and migration if the card needs persistence.
2. Add request and response schemas.
3. Add repository functions for database access.
4. Add service logic.
5. Add handler and route wiring.
6. Add tests for success and error paths.
7. Update docs if the final API differs from the approved spec.

The upload service must:

- Validate file type and size before writing metadata.
- Store the object through `packages/storage`.
- Create document records through the DB boundary.
- Queue processing work through `packages/queue` when needed.
- Return a stable response envelope from `@axentra/shared`.
- Avoid logging document contents, secrets, or signed URLs.

### 4.3 Test first

Use focused service tests for business logic, then route tests for HTTP shape.

Example outline:

```typescript
import { describe, expect, it, mock } from "bun:test";

const storeObject = mock(() => Promise.resolve({ key: "documents/laporan.pdf" }));
const createDocument = mock(() => Promise.resolve({ id: "doc_001", filename: "laporan.pdf" }));

describe("uploadDocumentService", () => {
  it("accepts a supported PDF upload", async () => {
    const result = await uploadDocumentService({
      file: validPdfFile,
      storage: { storeObject },
      repository: { createDocument },
    });

    expect(result.filename).toBe("laporan.pdf");
    expect(storeObject).toHaveBeenCalled();
    expect(createDocument).toHaveBeenCalled();
  });
});
```

Tests should cover:

- Valid PDF.
- Multiple valid DOCX files where applicable.
- Unsupported `.JPG`.
- Storage failure.
- Duplicate detection when the card includes duplicate behavior.
- Authorization failure once authentication exists.

### 4.4 Verify and commit

```powershell
bun run type-check
bun test
bun run lint
bun run fmt
bun run build
```

Then:

```powershell
git add apps/api packages/db packages/storage packages/queue docs
git commit -m "feat(documents): implement upload API [BE-S1-02]"
git push -u origin HEAD
```

Open a PR against `dev`.

The PR description must include:

- Card ID.
- Sprint.
- User Story ID.
- Acceptance Criteria IDs.
- Docs touched.
- Verification commands.
- Contract deviations, if any.

---

## 5. Picking Up a Frontend Card

Example card: `FE-S1-01` - Build Member Team dashboard upload area.

```powershell
git checkout dev
git pull origin dev
git checkout -b FE-S1-01-Build-member-upload-dashboard
```

### 5.1 Read first

Read:

- [business/textual-design-member-team.md](business/textual-design-member-team.md).
- [api-specs/03-documents.md](api-specs/03-documents.md).
- [technical-specs/05-module-definitions.md](technical-specs/05-module-definitions.md).
- [CODING_STANDARD.md](CODING_STANDARD.md).
- [business/acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md](business/acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md).

Relevant acceptance criteria:

| AC       | Expectation                                     |
| -------- | ----------------------------------------------- |
| AC-01.01 | Upload one PDF.                                 |
| AC-01.02 | Show the uploaded document in recent documents. |
| AC-01.03 | Show unsupported type feedback for `.JPG`.      |
| AC-01.04 | Upload multiple DOCX files.                     |

### 5.2 Feature folder

Expected future frontend feature shape:

```text
apps/web/src/features/documents/
  documents.api.ts
  documents.presenter.ts
  documents.view.tsx
```

Keep responsibilities separate:

| File                     | Responsibility                                      |
| ------------------------ | --------------------------------------------------- |
| `documents.api.ts`       | Calls API client and maps transport errors.         |
| `documents.presenter.ts` | State derivation, validation messages, view models. |
| `documents.view.tsx`     | React rendering and user interaction wiring.        |

### 5.3 Implement behavior

The upload dashboard should include:

- Drag-and-drop area.
- File picker fallback.
- Support for one PDF and multiple DOCX files.
- Rejection state for unsupported files.
- Upload progress or loading state.
- Success state using API response.
- Duplicate warning state once duplicate endpoint is wired.
- Recent documents list.
- Retry affordance for failed upload.

Do not hardcode success-only UI. Every API-backed action must represent loading, empty, error, and
success states.

### 5.4 Verify and commit

```powershell
bun run type-check
bun test
bun run lint
bun run fmt
bun run build
```

Then:

```powershell
git add apps/web docs
git commit -m "feat(documents): build member upload dashboard [FE-S1-01]"
git push -u origin HEAD
```

Open a PR against `dev`.

---

## 6. Picking Up an Acceptance Verification Card

Example card: `QA-S1-01` - Verify upload and duplicate flow. The `QA` ID prefix denotes
verification work only; the card is performed by its assigned PIC and signed off by Arya, not by a
separate QA role.

```powershell
git checkout dev
git pull origin dev
git checkout -b QA-S1-01-Verify-upload-duplicate-flow
```

### 6.1 Read first

Read:

- [business/acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md](business/acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md).
- [E2E_TESTING.md](E2E_TESTING.md).
- [api-specs/03-documents.md](api-specs/03-documents.md).
- [business/textual-design-member-team.md](business/textual-design-member-team.md).

### 6.2 Test scenarios

Minimum scenarios:

| Scenario             | Expected result                               |
| -------------------- | --------------------------------------------- |
| Upload one PDF       | Accepted and appears in recent documents.     |
| Upload multiple DOCX | Accepted and each file is visible.            |
| Upload `.JPG`        | Rejected with clear unsupported-type message. |
| Upload duplicate     | Shows `File ini sudah ada`.                   |
| Metadata extraction  | Detail view shows extracted author metadata.  |

### 6.3 Evidence

Acceptance verification evidence should include:

- Environment tested.
- Browser and OS.
- Test data filenames.
- Screenshots or logs for failures.
- AC pass/fail table.
- Bug links if any scenario fails.

If a scenario cannot run because a dependency is not implemented, mark it **Blocked**, not **Pass**.

---

## 7. Arya Isnaidi: Reviewing a PR

The developer self-reviews against [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md) before
requesting review.

Review pass:

1. PR targets `dev` for normal sprint work.
2. PR description lists Card ID, Sprint, User Story, AC IDs, docs, and verification commands.
3. API behavior matches the relevant file in [api-specs/\_index.md](api-specs/_index.md).
4. Business behavior matches [business/acceptance-criteria.md](business/acceptance-criteria.md).
5. Code follows [CODING_STANDARD.md](CODING_STANDARD.md).
6. No production file exceeds 300 lines without justification.
7. No secret, document content, object key leak, or signed URL appears in logs.
8. Authorization is enforced server-side before frontend route hiding.
9. Mutations write audit events where required by the BA scope.
10. `bun run complete-check` passes locally or in CI.

For contract changes:

- Update API spec.
- Update frontend API client expectation.
- Update technical specs if module behavior changed.
- Call out the deviation in the PR body.

---

## 8. Arya Isnaidi: Promoting and Releasing

Promotion rules follow [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md).

### 8.0 One-time repository bootstrap

The repository starts without a remote commit in a fresh workspace. Arya performs this one-time
bootstrap before enabling branch protection; it is the only direct push to `main` allowed by this
runbook. The remote URL must be the private GitHub URL supplied by the organization.

```powershell
git checkout main
git add .
git commit -m "chore(foundation): bootstrap Axentra Foundation v1.0.0"
git remote add origin <private-repository-url>
git push -u origin main
git checkout -b dev
git push -u origin dev
```

After bootstrap, all changes follow feature-branch PRs into `dev`; `main` receives release PRs only.

### 8.1 Test acceptance

Before promoting anything to `main`, Arya confirms that the `dev` branch is ready:

- All task PRs for the release scope are merged into `dev`.
- CI is green on the `dev` commit.
- The `dev` artifact is deployed and the assigned card PIC has completed the AC smoke flow.
- Web shell loads, API liveness passes, API readiness reports dependencies ready, and Worker starts
  without dependency errors.
- Arya records the acceptance decision in the release PR or sprint handoff.

### 8.2 `dev` to `main`

Use a release PR; protected branches are never updated by a developer laptop:

```powershell
git checkout dev
git pull --ff-only origin dev
git checkout -b release/v0.1.0
git push -u origin release/v0.1.0
gh pr create --base main --head release/v0.1.0 --title "release: Axentra v0.1.0" --body "Attach CI and acceptance evidence."
```

After GitHub merges the release PR, pull `main`, create the matching tag, and push the tag:

```powershell
git checkout main
git pull --ff-only origin main
git tag v0.1.0
git push origin v0.1.0
```

Before Production deploy:

- Confirm Arya's Test acceptance sign-off.
- Confirm `bun run complete-check` passed for the release commit.
- Take a fresh database backup.
- Confirm object storage bucket policy.
- Confirm rollback artifact is available.

After Production deploy:

- Verify `/api/v1/health`.
- Verify `/api/v1/health/ready`.
- Inspect API and Worker logs.
- Smoke-test the released BA flow.

---

## 9. Common Scenarios

### 9.1 API readiness fails locally

Run:

```powershell
bun run infra:up
bun run db:migrate
Invoke-RestMethod http://localhost:3001/api/v1/health/ready
```

If still failing, check [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md).

### 9.2 A task needs a docs update

Update docs in the same PR when the behavior changes:

| Change type       | Docs to check                                          |
| ----------------- | ------------------------------------------------------ |
| API contract      | `docs/api-specs/`                                      |
| Business behavior | `docs/business/`                                       |
| Module structure  | `docs/technical-specs/`                                |
| Environment       | `docs/technical-specs/11-environment-configuration.md` |
| Deployment        | [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md)               |

### 9.3 A card cannot finish in the sprint

Do not silently expand scope. In the PR or sprint board, state:

- What is complete.
- What remains.
- Which ACs are blocked.
- Why it is blocked.
- Proposed carry-over card.

### 9.4 Backend and Frontend disagree on contract

The approved contract is the source of truth:

1. Check [api-specs/\_index.md](api-specs/_index.md).
2. Check the specific endpoint spec.
3. If the spec is wrong, update it in the same PR.
4. If the implementation is wrong, keep the spec and fix the implementation.

### 9.5 External OCR or AI provider is not ready

Use deterministic processing behind the planned interface:

- Store metadata fields with predictable placeholder extraction.
- Generate stable Smart Tag examples only in non-production fixtures.
- Keep provider-specific code behind [technical-specs/10-integration-points.md](technical-specs/10-integration-points.md).
- Do not block upload, duplicate detection, or storage work on provider selection.
