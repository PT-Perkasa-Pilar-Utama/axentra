# End-to-End Testing

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Date:** 2026-10-27<br>
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Planned (lihat FND-10: eksekusi manual via Playwright MCP, bukti per flow)

This document defines the E2E layer that complements `bun test`, integration tests, and the
standard verification gate. Bun tests exercise modules and infrastructure boundaries. E2E flows
drive the rendered Web UI against the running API, Worker, database, Redis, and object storage
stack through the Playwright MCP, and each run is recorded as evidence.

Axentra has no dedicated QA role. The assigned card PIC prepares acceptance evidence, and Arya
Isnaidi (Tech Lead) records the final acceptance sign-off for the Test environment.

Every business E2E flow must map back to numbered acceptance criteria in
[business/acceptance-criteria.md](business/acceptance-criteria.md).

---

## Table of Contents

1. [Current Status](#1-current-status)
2. [Tooling: Playwright MCP](#2-tooling-playwright-mcp)
3. [Evidence Layout](#3-evidence-layout)
4. [Run Procedure](#4-run-procedure)
5. [Recording a Flow](#5-recording-a-flow)
6. [Flow Standards](#6-flow-standards)
7. [Acceptance Criteria Coverage](#7-acceptance-criteria-coverage)
8. [Test Data Strategy](#8-test-data-strategy)
9. [CI Strategy](#9-ci-strategy)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Current Status

E2E flows are run manually through the Playwright MCP. Each run is recorded as evidence: the
observed result in `docs/screenshots/<CARD-ID>/EVIDENCE.md` and a screenshot next to it (section 3).
The repository has no browser E2E suite and no E2E script.

Current verification commands:

```powershell
bun run complete-check
bun run infra:up
bun run test:integration
```

Current implemented automated coverage:

| Layer       | Command                    | Status      |
| ----------- | -------------------------- | ----------- |
| Type-check  | `bun run type-check`       | Implemented |
| Lint        | `bun run lint`             | Implemented |
| Format      | `bun run fmt`              | Implemented |
| Unit tests  | `bun test`                 | Implemented |
| Build       | `bun run build`            | Implemented |
| Integration | `bun run test:integration` | Implemented |
| Browser E2E | Manual, Playwright MCP     | Planned     |

Do not mark any AC as E2E-passed until its flow has run against a running environment on the
commit under release and the evidence, including that commit's SHA, is recorded.

---

## 2. Tooling: Playwright MCP

E2E runs use the Playwright MCP. Install it for your client from the section
`E2E: Playwright MCP (instalasi lokal)` in `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`. Developers do
not install a separate E2E framework.

Why the Playwright MCP fits Axentra:

- It drives Chromium against the real Web app and acts on the rendered labels.
- Its accessibility snapshot shows the labels and roles that section 6.3 selects on.
- Its screenshots serve as acceptance evidence.
- It leaves no flow files or record/replay blobs in the repository.

The earlier Maestro Web plan is superseded. The evidence requirement in section 5 still applies.

---

## 3. Evidence Layout

Each card keeps its evidence in one folder, `docs/screenshots/<CARD-ID>/`. `<CARD-ID>` is the card
whose feature the run verifies, for example `FE-S1-02` or `BE-S3-02`. A re-verification run, such as
the `FND-10` re-run of Sprint 1-3, files its evidence under the card of the feature it exercises.

```text
docs/screenshots/FE-S1-02/
|-- EVIDENCE.md
|-- after-refresh.png
`-- pagination-page1-rerun-2026-10-27.png
```

- `EVIDENCE.md` holds the evidence records from section 5.2, one record per AC and run. A re-run
  adds a dated section below the earlier records.
- Screenshots sit next to it. Name each file with a short kebab-case slug of the state it shows, and
  add the run date for a re-run.
- A run without a screenshot, such as a download, a timing, or a blocked check, says so in its
  record: `Screenshot: No screenshot (<reason>)`.
- When a later run supersedes a screenshot, the older record says so. Delete the file when no
  record references it.

---

## 4. Run Procedure

No E2E script is planned. Each run starts the local runtime, then drives the Web UI through the
Playwright MCP.

Required local runtime before running E2E:

```powershell
bun run infra:up
bun run db:migrate
bun run dev:api
bun run dev:worker
bun run dev:web
```

Expected local target:

| Surface       | URL                                         |
| ------------- | ------------------------------------------- |
| Web           | `http://localhost:5173`                     |
| API liveness  | `http://localhost:3001/api/v1/health`       |
| API readiness | `http://localhost:3001/api/v1/health/ready` |

Run steps:

1. Confirm that the Playwright MCP tools are available in your client.
2. Open `http://localhost:5173` and log in through the login UI with a seeded test user for the role.
3. Perform the WHEN steps of the AC with the fixtures in section 8.1.
4. Check the THEN step on screen and capture a screenshot of that state.
5. Record the run as described in section 5.2, and save the screenshot under
   `docs/screenshots/<CARD-ID>/`.

---

## 5. Recording a Flow

### 5.1 Pick the AC

Each run names at least one AC identifier from the BA sheet. Examples:

- `AC-01.01 - upload one valid PDF`
- `AC-04.03 AC-04.04 - single and multiple Top Tags filter`
- `AC-13.01 - Head of Team toggles category download permission`

If a run covers several ACs, list every AC ID. Copy the GIVEN, WHEN, and THEN text from the sprint
file in `docs/business/acceptance-criteria-breakdown/`.

### 5.2 Evidence record

Write one record per run in `docs/screenshots/<CARD-ID>/EVIDENCE.md` and link that file from the
card PR description. A re-run adds a dated section and leaves the earlier record in place.

```text
AC:          AC-01.01
Card:        FE-S1-01
Commit:      <full SHA of the code under test>
Environment: local, Web http://localhost:5173, API http://localhost:3001
Role:        member_team (seeded test account)
Input:       laporan-valid.pdf (fixture, section 8.1)
Expected:    Saya melihat pesan sukses: "File diterima untuk diproses"
Observed:    <text or state seen on screen>
Result:      Pass | Fail | Blocked
Screenshot:  docs/screenshots/FE-S1-01/upload-toast.png
```

Rules for records:

- Record the full commit SHA in `Commit:`. A record without a SHA, or with a SHA older than the
  release candidate, keeps its row at `Recorded, release pending` (section 7).
- Mark `Blocked`, not `Pass`, when a dependency is missing.
- Use synthetic fixtures only.
- Do not record credentials, bearer tokens, signed URLs, or object keys in the record or the
  screenshot.
- The card PIC prepares the record. Arya Isnaidi (Tech Lead) records the final sign-off.

---

## 6. Flow Standards

### 6.1 What must be true

- Flows must run against the real local or Test environment.
- Flows must use stable labels or test IDs.
- Flows must avoid arbitrary sleeps.
- Flows must use deterministic seed data.
- Flows must not depend on production credentials.
- Flows must not expose object keys, signed URLs, tokens, or document content in logs.
- Flows must map to AC IDs and sprint cards.

### 6.2 What not to put in E2E flows

- API mocks.
- Hardcoded production credentials.
- Tests that depend on personal browser state.
- Tests that require manual data cleanup after every run.
- Assertions against unstable timestamps unless the data is seeded.
- Happy-path-only coverage for upload, download, or permission flows.

### 6.3 Selector strategy

Preferred selector order:

1. User-visible labels when stable and business-approved.
2. Dedicated `data-testid` values for controls with unstable copy.
3. Accessibility role and name, as shown in the Playwright MCP snapshot.

Selectors must not rely on generated CSS class names.

---

## 7. Acceptance Criteria Coverage

Each row names the evidence file behind its status. The status vocabulary and the known gaps follow
the tables.

### 7.1 Foundation

| AC        | Scenario                         | Area     | Status  | Evidence |
| --------- | -------------------------------- | -------- | ------- | -------- |
| AC-FND-02 | API liveness visible from Web    | smoke    | Planned | None     |
| AC-FND-03 | API readiness visible from Web   | smoke    | Planned | None     |
| AC-FND-05 | Local infra supports E2E runtime | precheck | Planned | None     |

### 7.2 Sprint 1 - Upload, Duplicate Detection, Metadata

| AC       | Scenario                                                                      | Area       | Status                    | Evidence                                     |
| -------- | ----------------------------------------------------------------------------- | ---------- | ------------------------- | -------------------------------------------- |
| AC-01.01 | Member Team uploads one valid PDF and sees `File diterima untuk diproses`     | documents  | Recorded, release pending | [FE-S1-01](screenshots/FE-S1-01/EVIDENCE.md) |
| AC-01.02 | Uploaded `laporan.pdf` appears in the recent document list after refresh      | documents  | Recorded, release pending | [FE-S1-02](screenshots/FE-S1-02/EVIDENCE.md) |
| AC-01.03 | Unsupported `.JPG` upload shows `Tipe file tidak didukung`                    | documents  | Recorded, release pending | [FE-S1-01](screenshots/FE-S1-01/EVIDENCE.md) |
| AC-01.04 | Member Team uploads three DOCX files and sees a success notification for each | documents  | Recorded, release pending | [FE-S1-01](screenshots/FE-S1-01/EVIDENCE.md) |
| AC-02.01 | Duplicate upload shows `File ini sudah ada`                                   | documents  | Recorded, release pending | [FE-S1-04](screenshots/FE-S1-04/EVIDENCE.md) |
| AC-02.02 | Duplicate upload does not appear in the recent document list                  | documents  | Recorded, release pending | [FE-S1-04](screenshots/FE-S1-04/EVIDENCE.md) |
| AC-02.03 | Non-duplicate upload shows `File diterima untuk diproses`                     | documents  | Recorded, release pending | [FE-S1-04](screenshots/FE-S1-04/EVIDENCE.md) |
| AC-03.01 | Detail page shows the correct author in the metadata column                   | processing | Recorded, release pending | [FE-S1-03](screenshots/FE-S1-03/EVIDENCE.md) |

### 7.3 Sprint 2 - Smart Tags, Category, Search, Related Documents

| AC       | Scenario                                                                                              | Area       | Status                    | Evidence                                     |
| -------- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------- | -------------------------------------------- |
| AC-04.01 | Top Tags panel appears on the search results page                                                     | search     | Recorded, release pending | [FE-S2-01](screenshots/FE-S2-01/EVIDENCE.md) |
| AC-04.02 | Processed document shows up to 3 Smart Tags, and the Top Tags bar adds new tags                       | processing | Recorded, release pending | [FE-S2-01](screenshots/FE-S2-01/EVIDENCE.md) |
| AC-04.03 | Single Top Tags click filters results to that tag and highlights the active tag                       | search     | Recorded, release pending | [FE-S2-02](screenshots/FE-S2-02/EVIDENCE.md) |
| AC-04.04 | Top Tags `Strategy` and `Legal` together show documents with both tags                                | search     | Recorded, release pending | [FE-S2-02](screenshots/FE-S2-02/EVIDENCE.md) |
| AC-05.01 | New category `Reporting` appears in the category menu and holds the document; download stays inactive | processing | Recorded, release pending | [FE-S2-03](screenshots/FE-S2-03/EVIDENCE.md) |
| AC-05.02 | Documents with `Reporting` and `Contract` content go to different categories                          | processing | Recorded, release pending | [FE-S2-03](screenshots/FE-S2-03/EVIDENCE.md) |
| AC-06.01 | Search for `API` shows at least one relevant document                                                 | search     | Recorded, release pending | [FE-S2-04](screenshots/FE-S2-04/EVIDENCE.md) |
| AC-06.02 | Each result shows the file name and a matching text snippet                                           | search     | Recorded, release pending | [FE-S2-04](screenshots/FE-S2-04/EVIDENCE.md) |
| AC-06.03 | Search shows results in under 3 seconds                                                               | search     | Recorded, release pending | [FE-S2-04](screenshots/FE-S2-04/EVIDENCE.md) |
| AC-06.04 | Search for `xyzabc` shows `Tidak ada hasil yang ditemukan`                                            | search     | Recorded, release pending | [FE-S2-04](screenshots/FE-S2-04/EVIDENCE.md) |
| AC-07.01 | Detail page shows the `Dokumen Terkait` section                                                       | documents  | Recorded, release pending | [FE-S2-05](screenshots/FE-S2-05/EVIDENCE.md) |
| AC-07.02 | `Dokumen Terkait` items share at least one tag with the open document                                 | documents  | Recorded, release pending | [FE-S2-05](screenshots/FE-S2-05/EVIDENCE.md) |

### 7.4 Sprint 3 - Preview, Download, Bulk Download

| AC       | Scenario                                                                        | Area      | Status                    | Evidence                                     |
| -------- | ------------------------------------------------------------------------------- | --------- | ------------------------- | -------------------------------------------- |
| AC-08.01 | Preview shows the whole document in the viewer without a download               | documents | Recorded, release pending | [FE-S3-01](screenshots/FE-S3-01/EVIDENCE.md) |
| AC-09.01 | `Download` on the preview page saves the file in its original format            | downloads | Recorded, release pending | [FE-S3-02](screenshots/FE-S3-02/EVIDENCE.md) |
| AC-10.01 | `Download Selected` on the dashboard saves the selected documents as one `.zip` | downloads | Recorded, release pending | [FE-S3-03](screenshots/FE-S3-03/EVIDENCE.md) |

### 7.5 Sprint 4 - Analytics, Audit Trail, Category Permission

| AC       | Scenario                                          | Area        | Status  | Evidence                                     |
| -------- | ------------------------------------------------- | ----------- | ------- | -------------------------------------------- |
| AC-11.01 | Head of Team sees total document metric           | analytics   | Planned | None                                         |
| AC-11.02 | Head of Team sees last-7-days upload metric       | analytics   | Planned | None                                         |
| AC-12.01 | Head of Team sees download audit trail            | analytics   | Planned | None                                         |
| AC-13.01 | Head of Team toggles category download permission | permissions | Blocked | [BE-S3-02](screenshots/BE-S3-02/EVIDENCE.md) |

### 7.6 Status Vocabulary

| Status                                                     | Meaning                                                                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Planned`                                                  | No run is recorded for the AC.                                                                                                                      |
| `Recorded, release pending` (run tercatat, rilis menunggu) | A run is recorded in `docs/screenshots/<CARD-ID>/EVIDENCE.md`, but no run on the commit under release exists. Repeat the flow on the committed SHA. |
| `Blocked`                                                  | A dependency is missing. The evidence record names it.                                                                                              |
| `Passed`                                                   | A run on the committed SHA passed. Use it only in release evidence, never in this permanent guide.                                                  |

Coverage table rules:

- Move a row from `Planned` to `Recorded, release pending` when its run is recorded in
  `docs/screenshots/<CARD-ID>/EVIDENCE.md`.
- Use `Blocked` when a dependency is missing.
- Change `Status` to `Passed` only in release evidence, not in this permanent guide.
- If a scenario is blocked by missing product code, mark the sprint card as blocked instead of
  editing this guide to pretend coverage exists.

Known gaps in the evidence recorded on 2026-10-27:

- No record carries a commit SHA.
- `FE-S1-01` and `FE-S1-04` record upload toasts with the prefix "Unggah berhasil." or "Unggah
  gagal.". The Web app no longer shows that prefix, so those runs need a repeat.
- `FE-S2-04` records the empty-search message with the searched keyword appended. The BA copy is
  `Tidak ada hasil yang ditemukan`.
- `FE-S3-01` covers PDF only. It records no DOCX preview run for AC-08.01.
- `BE-S3-02` records the UI note "Anda tidak memiliki izin mengunduh dokumen ini." after a 403. The
  Web app now reads `canDownload`, disables the button before any click, and shows
  `DOWNLOAD_ACCESS_DENIED_MESSAGE` for a category with download disabled.
- AC-13.01 stays `Blocked`. `BE-S3-02` records that the Web app has no category permission toggle.
  The Sprint 4 cards BE-S4-03, BE-S4-04, and FE-S4-03 deliver it.

---

## 8. Test Data Strategy

### 8.1 Fixtures

Required document fixtures:

| Fixture               | Purpose                           |
| --------------------- | --------------------------------- |
| `laporan-valid.pdf`   | Single valid PDF upload.          |
| `kontrak-a.docx`      | First DOCX in multi-file upload.  |
| `kontrak-b.docx`      | Second DOCX in multi-file upload. |
| `unsupported.jpg`     | Unsupported file rejection.       |
| duplicate PDF fixture | Duplicate detection.              |

Fixtures must be safe to commit and must not contain confidential client data.

### 8.2 Seeds

Seed data should create:

- Member Team user.
- Head of Team user.
- Categories with active and inactive download permissions.
- Documents with metadata.
- Documents with Smart Tags.
- Download audit events.

Login is implemented on `dev`, so each flow logs in through the login UI with a seeded,
non-production user for the role.

### 8.3 Cleanup

E2E runs should be repeatable. Preferred cleanup strategies:

1. Recreate database schema before the suite.
2. Clear only test-owned rows by namespace.
3. Reset MinIO/S3 test bucket prefix.
4. Clear queued test jobs.

Production-like environments must never run destructive reset commands.

### 8.4 Akun uji

Test accounts come from the local identity directory. The API reads it from
`AUTH_LOCAL_IDENTITY_DIRECTORY` in development and test. Each entry holds an identity `id`, `email`,
`name`, `role` (`member_team`, `head_of_team`, or `admin`), and an Argon2id `passwordHash`.

- Passwords are never written in the repo, in fixtures, in `.env.example`, or in evidence records.
- An E2E run uses an identity file set generated at the shell level and exported as
  `AUTH_LOCAL_IDENTITY_DIRECTORY` for that session. The CI integration job uses the same pattern in
  its "Generate integration auth fixture" step, which masks the value and passes it through
  `GITHUB_ENV`.
- Keep the generated value in your local `.env` or shell only. Do not paste it into a PR,
  screenshot, or evidence record.
- Production does not read this directory. It verifies against the users table.

---

## 9. CI Strategy

Current CI runs the foundation gate, not browser E2E.

Planned CI stages:

| Stage                            | Trigger                      | Required before merge |
| -------------------------------- | ---------------------------- | --------------------- |
| `complete-check`                 | Every PR                     | Yes                   |
| E2E smoke                        | PRs touching Web/API routing | Planned               |
| Full E2E                         | Release candidate            | Planned               |
| Internal acceptance verification | Test promotion               | Yes for BA flows      |

Before E2E can become a CI gate, the team must add:

- Browser E2E dependencies.
- E2E scripts in `package.json`.
- E2E fixtures.
- Non-production seeded users.
- CI service containers or hosted Test target.
- Artifact upload for screenshots/videos/logs.

---

## 10. Troubleshooting

| Symptom                                | Likely cause                                | Fix                                                                                                    |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Web page does not load                 | Web dev server is not running               | Run `bun run dev:web`.                                                                                 |
| API health fails                       | API process is not running                  | Run `bun run dev:api`.                                                                                 |
| Readiness reports database down        | PostgreSQL container is down                | Run `bun run infra:up`, then `bun run db:migrate`.                                                     |
| Readiness reports Redis down           | Redis container is down                     | Run `bun run infra:up`.                                                                                |
| Readiness reports storage down         | MinIO container or bucket setup failed      | Restart local infra and check MinIO console.                                                           |
| Upload flow fails before API request   | Fixture path or browser file input issue    | Verify fixture path and tool-specific upload syntax.                                                   |
| Duplicate test is flaky                | Seed or cleanup does not reset state        | Reset test namespace before the flow.                                                                  |
| Search response is slow                | Indexing or processing not completed        | Wait on visible processing-complete state, not sleep.                                                  |
| Download test exposes signed URL       | Test captured sensitive output              | Redact logs and fix app logging before merging.                                                        |
| Flow passes locally but fails on Test  | Seed data differs                           | Align Test seed data with E2E fixtures.                                                                |
| Playwright MCP tools are not available | MCP server is not registered in this client | Register it from the E2E section in `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`, then restart the client. |
