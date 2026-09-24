# End-to-End Testing

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Planned - E2E suite is not implemented in Foundation v1.0.0

This document defines the E2E layer that will complement `bun test`, integration tests, and the
standard verification gate. Bun tests exercise modules and infrastructure boundaries; E2E tests
will drive the rendered Web UI against the running API, Worker, database, Redis, and object storage
stack.

Axentra has no dedicated QA role. The assigned card PIC prepares acceptance evidence, and Arya
Isnaidi (Tech Lead) records the final acceptance sign-off for the Test environment.

Every business E2E flow must map back to numbered acceptance criteria in
[business/acceptance-criteria.md](business/acceptance-criteria.md).

---

## Table of Contents

1. [Current Status](#1-current-status)
2. [Recommended Tooling](#2-recommended-tooling)
3. [Planned Folder Structure](#3-planned-folder-structure)
4. [Planned Commands](#4-planned-commands)
5. [Authoring a New Flow](#5-authoring-a-new-flow)
6. [Flow Standards](#6-flow-standards)
7. [Acceptance Criteria Coverage](#7-acceptance-criteria-coverage)
8. [Test Data Strategy](#8-test-data-strategy)
9. [CI Strategy](#9-ci-strategy)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Current Status

Foundation v1.0.0 does not include a browser E2E suite yet.

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
| Browser E2E | Not available yet          | Planned     |

Do not mark any AC as E2E-passed until the E2E flow exists and has been executed against a running
environment.

---

## 2. Recommended Tooling

Recommended first E2E tool: **Maestro Web**.

Why Maestro is a good fit for Axentra:

- Flows are text files and reviewable in PRs.
- It can drive Chromium against the real Web app.
- It supports stable visible-label testing for workflow-heavy UI.
- It works well for future tablet-like interaction patterns.
- It avoids record/replay binary blobs.

Alternative acceptable tooling: Playwright.

If the team chooses Playwright instead, keep the same coverage matrix and AC tagging rules from
this document. The tool may change; the AC-linked evidence requirement does not.

---

## 3. Planned Folder Structure

Recommended layout:

```text
e2e/
|-- maestro/
|   |-- README.md
|   |-- config.yaml
|   |-- helpers/
|   |   |-- open-app.yaml
|   |   |-- login-member-team.yaml
|   |   `-- login-head-of-team.yaml
|   `-- flows/
|       |-- 00-smoke/
|       |-- auth/
|       |-- documents/
|       |-- processing/
|       |-- search/
|       |-- downloads/
|       |-- analytics/
|       `-- permissions/
`-- fixtures/
    |-- documents/
    |   |-- laporan-valid.pdf
    |   |-- kontrak-a.docx
    |   |-- kontrak-b.docx
    |   `-- unsupported.jpg
    `-- seeds/
```

`e2e/maestro/README.md` should be the operational quick-start. This file is the authoring and
coverage guide.

---

## 4. Planned Commands

These scripts are planned and must not be treated as available until added to `package.json`.

| Planned command                                  | Purpose                                      |
| ------------------------------------------------ | -------------------------------------------- |
| `bun run e2e`                                    | Run every E2E flow except manual-only flows. |
| `bun run e2e:smoke`                              | Run only `smoke` tagged flows.               |
| `bun run e2e:flow e2e/maestro/flows/<path>.yaml` | Run a single flow file.                      |
| `maestro test --include-tags ac-01 e2e/maestro`  | Run a specific AC group.                     |
| `maestro test --no-headless e2e/maestro`         | Debug with a visible browser.                |

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

---

## 5. Authoring a New Flow

### 5.1 Pick the AC

Every flow name must include at least one AC identifier.

Examples:

- `AC-01.01 - upload one valid PDF`
- `AC-04.03 AC-04.04 - filter by single and multiple tags`
- `AC-13.01 - Head of Team toggles category download permission`

If a flow covers multiple ACs, list every AC in the `name` field and tags.

### 5.2 Pick the location

| Flow type                         | Folder               |
| --------------------------------- | -------------------- |
| App boot, health, shell rendering | `flows/00-smoke/`    |
| Login/session/role switching      | `flows/auth/`        |
| Upload/list/detail/preview        | `flows/documents/`   |
| Metadata, Smart Tags, category    | `flows/processing/`  |
| Keyword search and tag filtering  | `flows/search/`      |
| Single and bulk downloads         | `flows/downloads/`   |
| Head of Team metrics              | `flows/analytics/`   |
| Category download permissions     | `flows/permissions/` |

### 5.3 Tag the flow

Required tags:

- Area tag, such as `documents`, `search`, `downloads`, or `permissions`.
- AC group tag, such as `ac-01`, `ac-04`, or `ac-13`.
- `smoke` only for the smallest boot or sanity checks.
- `manual` only for scenarios that cannot be automated safely yet.

### 5.4 Flow template

```yaml
appId: "http://localhost:5173"
name: "AC-01.01 - Member Team uploads one valid PDF"
tags:
  - documents
  - ac-01
---
# Proves AC-01.01 through the real Web UI and API.
- runFlow: ../../helpers/open-app.yaml
- runFlow: ../../helpers/login-member-team.yaml
- tapOn: "Upload Document"
- tapOn: "Choose File"
- inputText: "e2e/fixtures/documents/laporan-valid.pdf"
- tapOn: "Upload"
- assertVisible: "File diterima untuk diproses"
```

The exact syntax must be validated when the Maestro suite is introduced. Keep this template as a
directional authoring contract, not proof that the suite already runs.

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
3. Role-based selectors if the selected E2E tool supports them.

Selectors must not rely on generated CSS class names.

---

## 7. Acceptance Criteria Coverage

### 7.1 Foundation

| AC        | Scenario                         | Folder            | Status  |
| --------- | -------------------------------- | ----------------- | ------- |
| AC-FND-02 | API liveness visible from Web    | `flows/00-smoke/` | Planned |
| AC-FND-03 | API readiness visible from Web   | `flows/00-smoke/` | Planned |
| AC-FND-05 | Local infra supports E2E runtime | Manual precheck   | Planned |

### 7.2 Sprint 1 - Upload, Duplicate Detection, Metadata

| AC       | Scenario                                    | Folder              | Status  |
| -------- | ------------------------------------------- | ------------------- | ------- |
| AC-01.01 | Member Team uploads one valid PDF           | `flows/documents/`  | Planned |
| AC-01.02 | Uploaded file appears in recent documents   | `flows/documents/`  | Planned |
| AC-01.03 | Unsupported `.JPG` upload is rejected       | `flows/documents/`  | Planned |
| AC-01.04 | Member Team uploads multiple DOCX files     | `flows/documents/`  | Planned |
| AC-02.01 | Duplicate upload shows `File ini sudah ada` | `flows/documents/`  | Planned |
| AC-02.02 | Duplicate document is not persisted         | `flows/documents/`  | Planned |
| AC-02.03 | Non-duplicate upload succeeds               | `flows/documents/`  | Planned |
| AC-03.01 | Detail view shows extracted author metadata | `flows/processing/` | Planned |

### 7.3 Sprint 2 - Smart Tags, Category, Search, Related Documents

| AC       | Scenario                                      | Folder              | Status  |
| -------- | --------------------------------------------- | ------------------- | ------- |
| AC-04.01 | Top Tags filter appears                       | `flows/search/`     | Planned |
| AC-04.02 | Document shows up to 3 Smart Tags             | `flows/processing/` | Planned |
| AC-04.03 | Single-tag filter works                       | `flows/search/`     | Planned |
| AC-04.04 | Multi-tag filter works                        | `flows/search/`     | Planned |
| AC-05.01 | Document receives automatic category          | `flows/processing/` | Planned |
| AC-05.02 | Multiple documents receive categories         | `flows/processing/` | Planned |
| AC-06.01 | Search finds a matching document              | `flows/search/`     | Planned |
| AC-06.02 | Search result shows relevant filename/snippet | `flows/search/`     | Planned |
| AC-06.03 | Search completes within target response time  | `flows/search/`     | Planned |
| AC-06.04 | No-result search shows empty state            | `flows/search/`     | Planned |
| AC-07.01 | Detail page shows related documents           | `flows/documents/`  | Planned |
| AC-07.02 | Related document suggestion is relevant       | `flows/documents/`  | Planned |

### 7.4 Sprint 3 - Preview, Download, Bulk Download

| AC       | Scenario                                      | Folder             | Status  |
| -------- | --------------------------------------------- | ------------------ | ------- |
| AC-08.01 | Member Team previews a document               | `flows/documents/` | Planned |
| AC-09.01 | Member Team downloads one permitted document  | `flows/downloads/` | Planned |
| AC-10.01 | Member Team bulk downloads selected documents | `flows/downloads/` | Planned |

### 7.5 Sprint 4 - Analytics, Audit Trail, Category Permission

| AC       | Scenario                                          | Folder               | Status  |
| -------- | ------------------------------------------------- | -------------------- | ------- |
| AC-11.01 | Head of Team sees total document metric           | `flows/analytics/`   | Planned |
| AC-11.02 | Head of Team sees last-7-days upload metric       | `flows/analytics/`   | Planned |
| AC-12.01 | Head of Team sees download audit trail            | `flows/analytics/`   | Planned |
| AC-13.01 | Head of Team toggles category download permission | `flows/permissions/` | Planned |

Coverage table rules:

- Change `Status` to `Implemented` only after the flow exists in the repository.
- Change `Status` to `Passed` only in release evidence, not in this permanent authoring guide.
- If a scenario is blocked by missing product code, mark the sprint card as blocked instead of
  editing this guide to pretend coverage exists.

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

Until real auth lands, E2E setup may use role-specific test shortcuts only in non-production
environments. Once real auth exists, flows must use seeded users through the login UI.

### 8.3 Cleanup

E2E runs should be repeatable. Preferred cleanup strategies:

1. Recreate database schema before the suite.
2. Clear only test-owned rows by namespace.
3. Reset MinIO/S3 test bucket prefix.
4. Clear queued test jobs.

Production-like environments must never run destructive reset commands.

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

| Symptom                               | Likely cause                             | Fix                                                   |
| ------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Web page does not load                | Web dev server is not running            | Run `bun run dev:web`.                                |
| API health fails                      | API process is not running               | Run `bun run dev:api`.                                |
| Readiness reports database down       | PostgreSQL container is down             | Run `bun run infra:up`, then `bun run db:migrate`.    |
| Readiness reports Redis down          | Redis container is down                  | Run `bun run infra:up`.                               |
| Readiness reports storage down        | MinIO container or bucket setup failed   | Restart local infra and check MinIO console.          |
| Upload flow fails before API request  | Fixture path or browser file input issue | Verify fixture path and tool-specific upload syntax.  |
| Duplicate test is flaky               | Seed or cleanup does not reset state     | Reset test namespace before the flow.                 |
| Search response is slow               | Indexing or processing not completed     | Wait on visible processing-complete state, not sleep. |
| Download test exposes signed URL      | Test captured sensitive output           | Redact logs and fix app logging before merging.       |
| Flow passes locally but fails on Test | Seed data differs                        | Align Test seed data with E2E fixtures.               |
