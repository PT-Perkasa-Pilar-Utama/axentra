# Evidence: FE-S2-05 - Related documents

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-07.01
Card:        FE-S2-05
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Open detail page of report-api.pdf
Expected:    "Dokumen Terkait" section
Observed:    "Dokumen Terkait" section shown on the detail page
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-05/related-documents-detail.png
```

```text
AC:          AC-07.02
Card:        FE-S2-05
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Same page
Expected:    Each related document shares at least one tag
Observed:    sample-a.docx, sample-b.docx and sample-c.docx, each labelled "Tag yang sama: reporting"
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-05/related-documents-detail.png
```
