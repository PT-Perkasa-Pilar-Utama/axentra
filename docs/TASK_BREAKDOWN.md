# Task Breakdown

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Date:** 2026-10-27<br>
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Draft for Sprint Planning

---

## How to Use This Document

Each row is a sprint card. The **Board Card Title** column is the copyable line for the internal
sprint board. The **Task Description** column is the developer view. Cards are assigned during
sprint planning; developers do not self-pick.

Columns:

- **Card ID:** stable identifier used in branch names, commits, and PRs. Sprint cards use
  `<BE|FE|DB|QA>-S<sprint>-<NN>`; Foundation cards use `FND-<NN>`.
- **Branch name:** use the exact Card ID followed by an imperative kebab-case title, for example
  `BE-S1-01-Implement-auth-prerequisite` or `FE-S2-05-Build-related-documents-section`.
- **Board Card Title:** copy this into the sprint board. One line, action-oriented.
- **Task Description:** what the developer builds.
- **AC:** acceptance criteria ids this card satisfies.
- **PIC:** person in charge for the card.
- **Est:** developer-days.
- **Docs:** authoritative document sections for this card.

## Team Composition

This is an internal project team. There is no separate PM or dedicated QA role in the current
delivery model.

| Role                    | Team member               | Notes                                     |
| ----------------------- | ------------------------- | ----------------------------------------- |
| Tech Lead               | Arya Isnaidi              | Final architecture, review, and release   |
| Backend                 | Sami, Arya (Sprint 4)     | API, database, worker, storage, security  |
| Frontend                | Azis, Aiman               | Web UI, presenter, API integration        |
| Acceptance verification | Shared by card PIC + Arya | Manual verification and evidence per card |

PIC names in the tables use short names: `Arya`, `Sami`, `Azis`, and `Aiman`.

## Assignment Rationale

The split keeps backend responsibility close to data/security decisions, keeps frontend work grouped by
screen area, and treats acceptance verification as an internal activity led by Arya with evidence
prepared by each card PIC.

Approximate effort by sprint:

| Sprint   | Arya | Sami | Azis | Aiman |
| -------- | ---- | ---- | ---- | ----- |
| Sprint 1 | 1.3d | 4.6d | 2.1d | 3.5d  |
| Sprint 2 | 1.2d | 3.7d | 2.6d | 1.4d  |
| Sprint 3 | 1.5d | 2.2d | 0.7d | 1.9d  |
| Sprint 4 | 3.6d | 4.1d | 1.7d | 3.4d  |

## Work Model: Foundation + Contract-First Delivery

Foundation v1.0.0 is already implemented. It ships the Bun workspace, Web shell, API process,
Worker process, infrastructure boundaries, local Compose, CI, docs, and operational health
endpoints.

From Sprint 1 onward:

- Backend owns domain schema, API contracts, authorization checks, and server-side guarantees.
- Frontend implements real views against the stable API contract.
- Every user-facing feature links back to BA user stories and acceptance criteria.
- Download-related work must enforce category permission and write download audit events.
- AI/OCR processing can be shipped behind deterministic interfaces before the final provider is
  selected.

---

## Foundation: Completed

| Card ID | Board Card Title               | Task Description                                                                | AC        | PIC  | Est  | Docs                                          |
| ------- | ------------------------------ | ------------------------------------------------------------------------------- | --------- | ---- | ---- | --------------------------------------------- |
| FND-01  | Bootstrap Bun workspace        | Root workspace, package scripts, TypeScript config, lockfile, lint, and format. | AC-FND-01 | Arya | Done | technical-specs/03-repository-structure.md    |
| FND-02  | Ship Web foundation shell      | React/Vite shell with platform status feature and API client boundary.          | AC-FND-01 | Arya | Done | technical-specs/05-module-definitions.md      |
| FND-03  | Ship Hono API process          | API process, response envelopes, request context, health routes.                | AC-FND-02 | Arya | Done | api-specs/08-system.md                        |
| FND-04  | Ship Worker process            | Worker startup validation, technical job handling, graceful shutdown.           | AC-FND-04 | Arya | Done | technical-specs/02-system-architecture.md     |
| FND-05  | Add infrastructure packages    | Config, DB, queue, storage, observability, and shared contracts.                | AC-FND-01 | Arya | Done | technical-specs/04-tech-stack.md              |
| FND-06  | Add local infrastructure       | PostgreSQL, Redis, and MinIO Compose stack with health checks.                  | AC-FND-05 | Arya | Done | DEPLOYMENT_PLAN.md, TROUBLESHOOTING_GUIDE.md  |
| FND-07  | Add quality gates and CI       | Type-check, lint, format, tests, builds, Git hooks, and GitHub Actions.         | AC-FND-06 | Arya | Done | CODE_REVIEW_CHECKLIST.md                      |
| FND-08  | Build BA-aligned documentation | Business docs, API specs, technical specs, onboarding, task breakdown.          | AC-FND-06 | Arya | Done | docs/\_index.md, business/product-overview.md |

---

Foundation cards record the original bootstrap implementation. They are historical and do not
assign ongoing backend delivery to the Tech Lead. Sami remains the primary Backend PIC. Arya
supports assigned Backend cards as implementation support. Sprint 1 assigns Arya BE-S1-03,
BE-S1-05, and BE-S1-06, while Arya retains Tech Lead review and acceptance sign-off for the
overall release.

## Foundation Maintenance

| Card ID | Board Card Title                         | Task Description                                                                                                                                                                                                                                                                                                                                                                               | AC                                     | PIC  | Est               | Docs                                                                                                                                  |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| FND-09  | Add database studio shortcut             | Expose a root command for local PostgreSQL inspection through Drizzle Studio.                                                                                                                                                                                                                                                                                                                  | AC-FND-07                              | Arya | 0.2d              | ONBOARDING_GUIDE.md, acceptance-criteria-foundation.md                                                                                |
| FND-10  | Resolve Sprint 1-3 partials and blockers | Closes PARTIAL items and release blockers from the Sprint 1-3 status review of 2026-10-27 (a local report that is not committed; this row lists its scope): production login, durable sessions with refresh cookie, login rate limit, stuck processing recovery, search wildcard escape, bulk download memory hold, spec drift, and the FE gaps for upload, search, tags, detail, and bulk UI. | AC-01.01 to AC-10.01 (as applicable)   | Arya | tracked by branch | api-specs/\_index.md, api-specs/02-authentication.md, api-specs/03-documents.md, technical-specs/09-authentication.md, E2E_TESTING.md |
| FND-11  | Add Admin role cards to Sprint 4         | Bring the Admin role proposal into Sprint 4 (account, dashboard, audit, documents) as cards (Tech Lead decision, 2026-10-29). BA approval (Azizah, 2026-10-29) for the in-scope Admin stories; PROP-ADM-04 is not in any card.                                                                                                                                                                 | PROP-ADM-AC-01.01 to PROP-ADM-AC-05.01 | Arya | 0.2d              | proposals/admin-role-proposal.md                                                                                                      |
| FND-12  | Add shared App Shell guide               | Record the Tech Lead decision (2026-10-30) that every authenticated page uses one shared `AppShell`, with only the role menu and page content differing; rename the Admin home menu to "Dashboard"; move DB-S4-01, BE-S4-06, and BE-S4-08 to Arya (Tech Lead decision, 2026-10-30); link the guide from the Sprint 4 FE cards and the `add-frontend-feature` skill.                            | N/A                                    | Arya | 0.1d              | technical-specs/13-app-shell.md, proposals/admin-role-proposal.md                                                                     |

Decision IDs used by FND-10 (B1, B2, D8, D24, D30) are defined in [DECISIONS.md](DECISIONS.md). They are proposals until the Tech Lead records a decision.

The Tech Lead brought the Admin role into Sprint 4 (account, dashboard, audit, documents) on 2026-10-29 (see "Sprint 4: Admin"). The BA (Azizah) approved the in-scope Admin stories on 2026-10-29. PROP-ADM-04 is not in any card. Its proposal IDs (PROP-ADM-01 to PROP-ADM-05 and PROP-ADM-AC-01.01 to PROP-ADM-AC-05.01) are not BA IDs, and the cards use them until the BA confirms or renumbers them. See [proposals/admin-role-proposal.md](proposals/admin-role-proposal.md).

## Sprint 1: Upload, Duplicate Detection, Metadata

**Status:** Done. FND-10, which closes the Sprint 1-3 partials, is still awaiting Tech Lead approval.

Goal: Member Team can upload supported documents, see duplicate warnings, and view extracted
metadata.

### Backend

| Card ID  | Board Card Title                          | Task Description                                                                                                                                          | AC                           | PIC  | Est  | Docs                                                                 |
| -------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---- | ---- | -------------------------------------------------------------------- |
| DB-S1-01 | Create document core schema               | Add initial tables for documents, stored files, metadata, content hash, processing status, categories, tags, and download permissions.                    | AC-01.02, AC-02.02, AC-03.01 | Sami | 1.0d | technical-specs/06-data-model.md, api-specs/03-documents.md          |
| BE-S1-01 | Implement auth prerequisite               | Add server-side authenticated user context with roles `member_team` and `head_of_team`; expose `/auth/me` contract for Web gating.                        | Technical prerequisite       | Sami | 0.8d | api-specs/02-authentication.md, technical-specs/09-authentication.md |
| BE-S1-02 | Implement document upload API             | `POST /documents/upload`; accept supported files, store object, create document record, return accepted processing response.                              | AC-01.01, AC-01.02, AC-01.04 | Sami | 1.2d | api-specs/03-documents.md, technical-specs/10-integration-points.md  |
| BE-S1-03 | Validate file type and upload constraints | Reject unsupported file types such as `.JPG`; enforce MIME and extension policy; return stable error copy.                                                | AC-01.03                     | Arya | 0.5d | api-specs/03-documents.md, technical-specs/07-security.md            |
| BE-S1-04 | Implement duplicate detection             | Compute content hash, detect same-content upload, return `File ini sudah ada`, and prevent duplicate persistence.                                         | AC-02.01, AC-02.02, AC-02.03 | Sami | 0.8d | api-specs/03-documents.md, technical-specs/06-data-model.md          |
| BE-S1-05 | Implement metadata extraction result API  | Store and return extracted metadata fields such as author; use deterministic placeholder extractor until final OCR/AI provider is approved.               | AC-03.01                     | Arya | 0.8d | api-specs/04-processing.md, technical-specs/10-integration-points.md |
| BE-S1-06 | Implement recent document list API        | `GET /documents`; return recent documents for `member_team` and `head_of_team`, newest first, with `id`, `filename`, `processingStatus`, and `createdAt`. | AC-01.02                     | Arya | 0.6d | api-specs/03-documents.md                                            |

### Frontend

| Card ID  | Board Card Title                            | Task Description                                                                                                                                                                                                                                                                                                                    | AC                              | PIC   | Est  | Docs                                                               |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----- | ---- | ------------------------------------------------------------------ |
| FE-S1-01 | Build Member Team dashboard upload area     | Drag-and-drop upload panel for one PDF or multiple DOCX files; success, unsupported type, duplicate, processing, and retry states.                                                                                                                                                                                                  | AC-01.01, AC-01.03, AC-01.04    | Azis  | 1.3d | business/textual-design-member-team.md, api-specs/03-documents.md  |
| FE-S1-02 | Show recent uploaded documents              | Recent documents section refreshes after processing and shows uploaded filename such as `laporan.pdf`.                                                                                                                                                                                                                              | AC-01.02                        | Azis  | 0.8d | business/textual-design-member-team.md                             |
| FE-S1-03 | Render document metadata in detail view     | Detail page shows extracted author metadata after processing completes.                                                                                                                                                                                                                                                             | AC-03.01                        | Aiman | 0.8d | business/textual-design-member-team.md, api-specs/04-processing.md |
| FE-S1-04 | Wire upload API client and presenter states | Feature files follow API -> Presenter -> View; handles accepted, rejected, duplicate, loading, empty, and error states.                                                                                                                                                                                                             | AC-01.01 to AC-03.01            | Aiman | 0.7d | CODING_STANDARD.md                                                 |
| FE-S1-05 | Build Perkasa login UI and form presenter   | Implementasi kartu login sesuai mockup Perkasa (logo, input email dengan icon, input password dengan toggle lihat password, checkbox Ingat saya, tombol submit hijau dengan indikator loading). Terapkan Zod validation (`loginRequestSchema`), penanganan error credential (_alert envelope_), dan arsitektur _Presenter -> View_. | Prasyarat F-A1 & Desain Perkasa | Aiman | 1.0d | api-specs/02-authentication.md, CODING_STANDARD.md                 |
| FE-S1-06 | Wire auth session and Bearer token client   | Manajemen sesi Web (penyimpanan token, dukungan remember me), injeksi otomatis `Authorization: Bearer <token>` pada api-client.ts, route protection & redirect 401 ke /login (menutup blocker F-A1).                                                                                                                                | Prasyarat Proteksi API Dokumen  | Aiman | 0.8d | api-specs/02-authentication.md                                     |
| FE-S1-07 | Update application font to Exo 2            | Update application typography to Exo 2 across web shell (index.html, styles.css), configure Tailwind font token, and inherit global form controls.                                                                                                                                                                                  | Desain Perkasa                  | Aiman | 0.2d | CODING_STANDARD.md                                                 |

### Acceptance Verification

| Card ID  | Board Card Title                 | Task Description                                                                                  | AC                   | PIC  | Est  | Docs                                                                   |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------- | ---- | ---- | ---------------------------------------------------------------------- |
| QA-S1-01 | Verify upload and duplicate flow | Manual and automated coverage for valid PDF, multiple DOCX, unsupported JPG, duplicate, metadata. | AC-01.01 to AC-03.01 | Arya | 0.8d | business/acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md |

---

## Sprint 2: Smart Tags, Auto Category, Search, Related Documents

**Status:** Done. FND-10, which closes the Sprint 1-3 partials, is still awaiting Tech Lead approval.

Goal: uploaded documents become discoverable through AI-generated tags, auto categories, search,
and related-document suggestions.

### Backend

| Card ID  | Board Card Title                   | Task Description                                                                                                                | AC                                     | PIC  | Est  | Docs                                                                                      |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---- | ---- | ----------------------------------------------------------------------------------------- |
| BE-S2-01 | Implement Smart Tags processing    | Generate up to 3 Smart Tags per processed document; persist tags and expose document-level tags.                                | AC-04.02                               | Sami | 1.0d | api-specs/04-processing.md, technical-specs/05-module-definitions.md                      |
| BE-S2-02 | Implement Top Tags API             | `GET /tags/top`; return relevant tags for dashboard/search context and update when a new tag appears.                           | AC-04.01, AC-04.02                     | Arya | 0.6d | api-specs/05-search-tags-categories.md                                                    |
| BE-S2-03 | Implement tag filtering            | Support single-tag and multi-tag filtering in search/list endpoints.                                                            | AC-04.03, AC-04.04                     | Sami | 0.6d | api-specs/05-search-tags-categories.md                                                    |
| BE-S2-04 | Implement auto-category assignment | Assign category from content; auto-create category when needed; default new category download permission to inactive.           | AC-05.01, AC-05.02                     | Sami | 0.9d | api-specs/04-processing.md, api-specs/07-audit-permissions.md                             |
| BE-S2-05 | Implement document search          | `GET /search/documents`; search title and extracted content; return filename and text snippet; target response under 3 seconds. | AC-06.01, AC-06.02, AC-06.03, AC-06.04 | Sami | 1.2d | api-specs/05-search-tags-categories.md, technical-specs/08-non-functional-requirements.md |
| BE-S2-06 | Implement related documents API    | `GET /documents/:id/related`; return documents with at least one shared tag.                                                    | AC-07.01, AC-07.02                     | Arya | 0.6d | api-specs/03-documents.md                                                                 |

### Frontend

| Card ID  | Board Card Title                | Task Description                                                                                                  | AC                                     | PIC   | Est  | Docs                                                                           |
| -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----- | ---- | ------------------------------------------------------------------------------ |
| FE-S2-01 | Render Smart Tags and Top Tags  | Show max 3 Smart Tags per document and a Top Tags filter bar on dashboard/search.                                 | AC-04.01, AC-04.02                     | Azis  | 0.9d | business/textual-design-member-team.md                                         |
| FE-S2-02 | Build tag filter interactions   | Single-tag and multi-tag filter behavior; active tags are highlighted.                                            | AC-04.03, AC-04.04                     | Azis  | 0.7d | business/textual-design-member-team.md, api-specs/05-search-tags-categories.md |
| FE-S2-03 | Build category navigation       | Category menu includes auto-created categories and shows uploaded documents in their generated category.          | AC-05.01, AC-05.02                     | Aiman | 0.8d | business/textual-design-member-team.md                                         |
| FE-S2-04 | Build search results experience | Search bar, Enter submission, filename/snippet result cards, under-3-second visible state, and no-result message. | AC-06.01, AC-06.02, AC-06.03, AC-06.04 | Azis  | 1.0d | business/textual-design-member-team.md                                         |
| FE-S2-05 | Build related documents section | Detail page includes `Dokumen Terkait` with relevant tag-overlap suggestions.                                     | AC-07.01, AC-07.02                     | Aiman | 0.6d | business/textual-design-member-team.md                                         |

### FE-S2-03 delivery status (updated 2026-10-27)

- **Implementation complete in PR #42** ([FE-S2-03 category navigation and document integration](https://github.com/PT-Perkasa-Pilar-Utama/axentra/pull/42)); category listing, auto-assignment, and category-filtered document search are integrated with the real APIs.
- **Acceptance walkthrough verified on the local real stack** at PR head `e1d94cccff62222f8614979194bfbefd3e9a4657` (PR #42 merge `54fa15b`, head `c7a01c9`; API, Worker, PostgreSQL, Redis, MinIO, and Web): as `member_team`, uploaded synthetic `reporting.pdf` containing `Reporting` and `contract.pdf` containing `Contract`. The worker created separate categories and associated each document; selecting each category displayed only its matching document. Evidence screenshots are committed in [`docs/screenshots/FE-S2-03/`](screenshots/FE-S2-03/). `origin/dev` was unchanged at `1ba24d6` during this walkthrough.
- `QA-S2-01` remains responsible for sprint-level acceptance coverage and Tech Lead sign-off. This entry records FE-S2-03 evidence and does not replace that verification.

### Acceptance Verification

| Card ID  | Board Card Title                            | Task Description                                                                                      | AC                   | PIC  | Est  | Docs                                                                   |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------- | ---- | ---- | ---------------------------------------------------------------------- |
| QA-S2-01 | Verify discovery, tag, category, and search | Coverage for Smart Tags, Top Tags, single/multi-tag filter, auto category, fast search, related docs. | AC-04.01 to AC-07.02 | Arya | 1.0d | business/acceptance-criteria-breakdown/acceptance-criteria-sprint-2.md |

---

## Sprint 3: Preview, Download, Bulk Download

**Status:** Done. FND-10, which closes the Sprint 1-3 partials, is still awaiting Tech Lead approval.

Goal: Member Team can preview documents without downloading, download one permitted document, and
download selected documents as a `.zip`.

### Backend

| Card ID  | Board Card Title                 | Task Description                                                                                                             | AC                 | PIC  | Est  | Docs                                                         |
| -------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---- | ---- | ------------------------------------------------------------ |
| BE-S3-01 | Implement preview API            | `GET /documents/:id/preview`; return safe preview payload or signed preview URL without exposing unauthorized document data. | AC-08.01           | Arya | 1.0d | api-specs/03-documents.md, technical-specs/07-security.md    |
| BE-S3-02 | Implement single download API    | `GET /documents/:id/download`; recheck category permission, issue bounded signed URL or stream file, write audit event.      | AC-09.01           | Sami | 1.0d | api-specs/03-documents.md, api-specs/07-audit-permissions.md |
| BE-S3-03 | Implement bulk download zip API  | `POST /documents/bulk-download`; validate selected documents, enforce permissions per item, produce one `.zip`.              | AC-10.01           | Sami | 1.2d | api-specs/03-documents.md                                    |
| BE-S3-04 | Harden download audit write path | Ensure every successful single/bulk download records who, which document, and when.                                          | AC-09.01, AC-10.01 | Arya | 0.5d | api-specs/07-audit-permissions.md                            |

### Frontend

| Card ID  | Board Card Title                | Task Description                                                                                              | AC       | PIC   | Est  | Docs                                   |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- | ----- | ---- | -------------------------------------- |
| FE-S3-01 | Build document preview viewer   | Detail page opens document preview without triggering download.                                               | AC-08.01 | Aiman | 1.0d | business/textual-design-member-team.md |
| FE-S3-02 | Build single download action    | Download button starts original-format download when permission allows it; handles denied and expired states. | AC-09.01 | Azis  | 0.7d | business/textual-design-member-team.md |
| FE-S3-03 | Build selected bulk download UI | Dashboard supports multi-select and `Download Selected`; starts one `.zip` download.                          | AC-10.01 | Aiman | 0.9d | business/textual-design-member-team.md |

### FE-S3-01 delivery evidence (2026-10-20 walkthrough, superseded)

Walkthrough 2026-10-20 sudah usang. Screenshot pertama dari run FND-10, `inline-preview.png`, juga digantikan: iframe pada run itu memuat presigned URL penyimpanan, dan pratinjau kini mengalir lewat API. Run ulang 2026-10-27 dan catatannya ada di [EVIDENCE.md](screenshots/FE-S3-01/EVIDENCE.md). Ulangi run tersebut pada SHA yang di-commit sebelum rilis.

### Acceptance Verification

| Card ID  | Board Card Title               | Task Description                                                                       | AC                   | PIC  | Est  | Docs                                                                   |
| -------- | ------------------------------ | -------------------------------------------------------------------------------------- | -------------------- | ---- | ---- | ---------------------------------------------------------------------- |
| QA-S3-01 | Verify preview and download AC | Coverage for preview, single download original format, bulk `.zip`, permission denial. | AC-08.01 to AC-10.01 | Arya | 0.8d | business/acceptance-criteria-breakdown/acceptance-criteria-sprint-3.md |

---

## Sprint 4: Analytics, Audit Trail, Category Permissions

**Status:** Planned

**Estimated duration:** 5 working days for Sprint 4 as a whole (Head of Team, Admin accounts, dashboard, audit, and documents). Basis: Sami at 4.1d (BE-S4-01 to BE-S4-05, BE-S4-07); Arya at 3.6d (DB-S4-01, BE-S4-06, BE-S4-08, and the QA cards). Frontend: Aiman 3.4d, Azis 1.7d. The Tech Lead sets the calendar start and end dates.

Goal: Head of Team can monitor document usage, inspect download logs, and control Member Team
download permission by category.

### Backend

| Card ID  | Board Card Title                     | Task Description                                                                                            | AC                 | PIC  | Est  | Docs                                                              |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------ | ---- | ---- | ----------------------------------------------------------------- |
| BE-S4-01 | Implement analytics summary API      | `GET /analytics/summary`; return total documents and documents uploaded in the last 7 days.                 | AC-11.01, AC-11.02 | Sami | 0.7d | api-specs/06-analytics.md                                         |
| BE-S4-02 | Implement download audit trail API   | `GET /audit/downloads`; return user, document name, and timestamp for download events.                      | AC-12.01           | Sami | 0.8d | api-specs/07-audit-permissions.md                                 |
| BE-S4-03 | Implement permission category list   | `GET /permission-categories`; expose categories and Member Team download permission status to Head of Team. | AC-13.01           | Sami | 0.5d | api-specs/07-audit-permissions.md                                 |
| BE-S4-04 | Implement category permission toggle | `PATCH /permission-categories/:categoryId`; toggle inactive/active download permission for a category.      | AC-13.01           | Sami | 0.6d | api-specs/07-audit-permissions.md, technical-specs/07-security.md |

### Frontend

| Card ID  | Board Card Title                  | Task Description                                                                         | AC                 | PIC   | Est  | Docs                                                                     |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------ | ----- | ---- | ------------------------------------------------------------------------ |
| FE-S4-01 | Build Head of Team analytics page | Cards for total documents and documents uploaded in the last 7 days.                     | AC-11.01, AC-11.02 | Azis  | 0.7d | business/textual-design-head-of-team.md, technical-specs/13-app-shell.md |
| FE-S4-02 | Build download audit trail page   | Table shows who downloaded, document name, and when.                                     | AC-12.01           | Aiman | 0.8d | business/textual-design-head-of-team.md, technical-specs/13-app-shell.md |
| FE-S4-03 | Build permission category page    | Category list with inactive/active toggle; new auto-created categories default inactive. | AC-13.01           | Aiman | 0.9d | business/textual-design-head-of-team.md, technical-specs/13-app-shell.md |

### Acceptance Verification

| Card ID  | Board Card Title             | Task Description                                                                                    | AC                   | PIC  | Est  | Docs                                                                   |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- | ---- | ---- | ---------------------------------------------------------------------- |
| QA-S4-01 | Verify Head of Team controls | Coverage for analytics cards, audit trail fields, category toggle, and Member Team download access. | AC-11.01 to AC-13.01 | Arya | 0.8d | business/acceptance-criteria-breakdown/acceptance-criteria-sprint-4.md |

---

## Sprint 4: Admin

**Status:** Planned. Brought into scope by the Tech Lead on 2026-10-29. BA approved the in-scope stories on 2026-10-29 (Azizah, relayed by the Tech Lead). Open questions still need answers before the related cards start.

Goal: Admin can see a system summary, manage Member Team and Head of Team accounts, read the download audit trail for all users, and archive or soft-delete documents.

Scope (defaults from [proposals/admin-role-proposal.md](proposals/admin-role-proposal.md)):

- In scope: PROP-ADM-01 (dasbor), PROP-ADM-02 (akun), PROP-ADM-03 (dokumen), PROP-ADM-05 (audit trail semua pengguna).
- Out of scope: PROP-ADM-04 (bertentangan dengan AC-05.01) dan perubahan peran akun.
- Keputusan 2026-10-29: pertanyaan 5, 7, dan 9 sudah diputuskan (arsip tidak tampil untuk Member Team dan Head of Team; Admin hanya metadata, tanpa pratinjau atau unduh isi). Pertanyaan 1 disetujui sesuai usulan. Kartu di sprint ini tidak mengubah perilaku unduh. Sampai pertanyaan 9 dijawab, perilaku API tetap seperti sekarang.
- Urutan kerja: kartu dokumen (BE-S4-07, FE-S4-06, QA-S4-03) dikerjakan terakhir, setelah akun dan audit stabil, karena hapus lunak memengaruhi daftar dan pencarian Member Team.

**Estimated duration:** termasuk dalam estimasi Sprint 4 di atas. Beban Admin: Sami 1.5d (BE-S4-05, BE-S4-07), Arya 1.8d (DB-S4-01, BE-S4-06, BE-S4-08), Aiman 1.7d (FE-S4-05, FE-S4-06), Azis 1.0d (FE-S4-04, FE-S4-07), Arya juga 1.0d untuk QA (QA-S4-02, QA-S4-03).

### Backend

| Card ID  | Board Card Title                          | Task Description                                                                                                                                                                                                                                                                                                                                                                                                                                                 | AC                                                                         | PIC  | Est  | Docs                                                                 |
| -------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---- | ---- | -------------------------------------------------------------------- |
| DB-S4-01 | Add account status and document ownership | One reviewed migration: `users.status` (active/inactive, default active); `documents.uploaded_by` (FK to `users`, nullable, with a documented backfill rule for legacy rows); `documents.archived_at`. The existing `deleted_at` is reused for soft delete.                                                                                                                                                                                                      | PROP-ADM-AC-02.02, PROP-ADM-AC-02.03, PROP-ADM-AC-03.01, PROP-ADM-AC-03.03 | Arya | 0.7d | technical-specs/06-data-model.md, CODING_STANDARD.md                 |
| BE-S4-05 | Implement Admin summary API               | `GET /admin/summary` for role `admin`: users per role, total documents, uploads in the last 7 days, download count and latest download time.                                                                                                                                                                                                                                                                                                                     | PROP-ADM-AC-01.01 to 01.03                                                 | Sami | 0.6d | api-specs/06-analytics.md                                            |
| BE-S4-06 | Implement Admin account management API    | `GET /admin/users` lists Member Team and Head of Team accounts with name, role, and status. `PATCH /admin/users/:id/status` deactivates or reactivates them. A deactivated account cannot log in, and its sessions are revoked. Targets other than these two roles are rejected.                                                                                                                                                                                 | PROP-ADM-AC-02.01 to 02.03                                                 | Arya | 0.8d | api-specs/02-authentication.md, technical-specs/09-authentication.md |
| BE-S4-07 | Implement Admin document management API   | `GET /admin/documents` lists all documents with uploader and upload date. `GET /admin/documents/:id` returns detail and metadata. `POST /admin/documents/:id/archive` archives, and `DELETE /admin/documents/:id` soft-deletes. Metadata only: no preview or content. Archived and deleted documents leave Member Team and Head of Team lists and search. Admin can still find archived documents and unarchive them with `POST /admin/documents/:id/unarchive`. | PROP-ADM-AC-03.01 to 03.04                                                 | Sami | 0.9d | api-specs/03-documents.md, api-specs/05-search-tags-categories.md    |
| BE-S4-08 | Allow Admin on download audit trail       | Extend `GET /audit/downloads` (BE-S4-02) to role `admin`, covering downloads by all users. Server-side role check. Also remove role `admin` from the preview, preview content, download, and bulk-download routes (`documents.routes.ts`), per the 2026-10-29 decision.                                                                                                                                                                                          | PROP-ADM-AC-05.01                                                          | Arya | 0.3d | api-specs/07-audit-permissions.md                                    |

### Frontend

| Card ID  | Board Card Title                    | Task Description                                                                                                                                                                                                                  | AC                         | PIC   | Est  | Docs                                                              |
| -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----- | ---- | ----------------------------------------------------------------- |
| FE-S4-04 | Build Admin dashboard page          | Cards for users per role, total documents, uploads in the last 7 days, and download activity. Reuses the existing dashboard template.                                                                                             | PROP-ADM-AC-01.01 to 01.03 | Azis  | 0.7d | proposals/admin-role-proposal.md, technical-specs/13-app-shell.md |
| FE-S4-05 | Build account management page       | Account list with name, role, and status; "Nonaktifkan" and "Aktifkan" with confirmation, loading, and error states.                                                                                                              | PROP-ADM-AC-02.01 to 02.03 | Aiman | 0.8d | proposals/admin-role-proposal.md, technical-specs/13-app-shell.md |
| FE-S4-06 | Build document management page      | Document list with uploader and upload date; detail with metadata; \"Arsipkan\" and \"Hapus\" with confirmation, loading, and error states. Metadata only; no preview.                                                            | PROP-ADM-AC-03.01 to 03.04 | Aiman | 0.9d | proposals/admin-role-proposal.md, technical-specs/13-app-shell.md |
| FE-S4-07 | Add Admin navigation and audit page | Extract the shared `AppShell` with a role menu config (technical-specs/13-app-shell.md). Admin menu (Dashboard, Manajemen Akun, Manajemen Dokumen, Audit Trail) shown only to role `admin`. Reuses the FE-S4-02 audit trail page. | PROP-ADM-AC-05.01          | Azis  | 0.3d | proposals/admin-role-proposal.md, technical-specs/13-app-shell.md |

### Acceptance Verification

| Card ID  | Board Card Title                            | Task Description                                                                                                                                                                                              | AC                                                | PIC  | Est  | Docs                             |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---- | ---- | -------------------------------- |
| QA-S4-02 | Verify Admin accounts, dashboard, and audit | Coverage for the Admin summary, account deactivation and reactivation (including blocked login and revoked sessions), audit trail visibility, and denial of Admin routes for member_team and head_of_team.    | PROP-ADM-AC-01.01 to 01.03, 02.01 to 02.03, 05.01 | Arya | 0.5d | proposals/admin-role-proposal.md |
| QA-S4-03 | Verify Admin document controls              | Coverage for the document list with owner, archive hidden from Member Team search, soft delete removed from active lists with data kept, and denial of Admin routes for other roles. Runs last in the sprint. | PROP-ADM-AC-03.01 to 03.04                        | Arya | 0.5d | proposals/admin-role-proposal.md |

---

## Definition of Done

Applies to every BE, FE, DB, FND, and shared verification card:

- Code follows [CODING_STANDARD.md](CODING_STANDARD.md).
- API behavior matches [api-specs/\_index.md](api-specs/_index.md) and the relevant per-area file.
- Linked AC scenarios are verified locally.
- New or changed database schema has one reviewed migration.
- Server-side authorization is implemented before frontend route hiding.
- Sensitive data, document contents, credentials, and signed URLs are not logged.
- `bun run complete-check` passes before PR review.
- PR targets `dev` and includes verification evidence.

## Summary

| Sprint     | Focus                                                                                      | BE/DB cards | FE cards | Verification cards | Est total | Status  |
| ---------- | ------------------------------------------------------------------------------------------ | ----------- | -------- | ------------------ | --------- | ------- |
| Foundation | Runtime, infrastructure, docs, CI                                                          | Done        | Done     | Done               | Done      | Done    |
| Sprint 1   | Upload, duplicate detection, metadata, auth                                                | 6           | 6        | 1                  | 10.5d     | Done    |
| Sprint 2   | Smart Tags, category, search, related documents                                            | 6           | 5        | 1                  | 8.4d      | Done    |
| Sprint 3   | Preview, single download, bulk download                                                    | 4           | 3        | 1                  | 7.1d      | Done    |
| Sprint 4   | Analytics, audit trail, category download permission, Admin (akun, dasbor, audit, dokumen) | 9           | 7        | 3                  | 12.8d     | Planned |
