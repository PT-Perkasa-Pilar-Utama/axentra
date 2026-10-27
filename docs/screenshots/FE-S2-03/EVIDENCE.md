# Evidence: FE-S2-03 - Automatic categories and download state

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-05.01 (category)
Card:        FE-S2-03
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       report-api.pdf and sample-a/b/c.docx with Reporting content
Expected:    New category "Reporting" in the category menu holding the documents
Observed:    Category menu lists Legal, Reporting, Strategy; report-api.pdf and sample-*.docx are under Reporting
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-03/categories-menu.png
```

```text
AC:          AC-05.01 (download inactive)
Card:        FE-S2-03
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       contract-legal.pdf in category Legal (download disabled in DB), opened as member_team
Expected:    Download inactive for a new category until Head of Team enables it
Observed:    DB: Legal and Strategy download_enabled = false. Detail page: Download button ENABLED with note "Unduh dalam format asli". The button was not clicked for this document. Server denial was verified on report-api.pdf when its category was disabled (see BE-S3-02). The Web app does not read canDownload from the API.
Result:      Fail
Screenshot:  docs/screenshots/FE-S2-03/member-legal-category-download-enabled.png
Note:        Bug B1 in the review notes. The API response for GET /documents/:id includes canDownload, but apps/web does not call that route.
```

```text
AC:          AC-05.02
Card:        FE-S2-03
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       contract-legal.pdf (legal contract content) with report-api.pdf (reporting content)
Expected:    Documents land in different categories by content
Observed:    contract-legal.pdf is under Legal; report-api.pdf is under Reporting
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-03/categories-menu.png
Note:        Content with the word contract went to a category named Legal, not Contract. The AC requires only different categories.
```

## Re-check 2026-10-27: Bug B1 and related section

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, worktree Axentra-BE-S3-04, Playwright MCP (Chromium). Same stack and identity setup as the re-check in FE-S3-02/EVIDENCE.md. No application data was changed.

```text
AC:          AC-05.01 (download inactive)
Card:        FE-S2-03 (Bug B1 re-verification)
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       contract-legal.pdf in category Legal (downloadEnabled=false in DB), the same case that failed in the earlier run
Expected:    Download inactive while the category is disabled, with the denied note shown (Bug B1 fixed)
Observed:    Web now reads canDownload from GET /api/v1/documents/:id (false). Download button disabled; note "Akses unduh tidak diizinkan untuk kategori dokumen ini" shown. The earlier Fail for this step no longer reproduces.
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/detail-download-disabled-canDownload-false.png
```

```text
AC:          Dokumen Terkait (FE-S2-05); AC ID not restated in this re-check, see docs/screenshots/FE-S2-05/EVIDENCE.md
Card:        FE-S2-05 (re-check after fix)
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       report-api.pdf detail page; it shares tags (strategy, reporting) with other documents
Expected:    Dokumen Terkait section appears with the related documents and their shared tag
Observed:    Section shows strategy-legal.pdf (tag strategy), sample-a.docx, sample-b.docx and sample-c.docx (tag reporting). Full-page screenshot captured.
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-05/detail-related-after-fix.png
Note:        Observation, not part of this fix: the dashboard list requests page=1&limit=5 and gets meta.total=6, but the Next button is hard-disabled (title "Fitur navigasi halaman belum tersedia"). report-api.pdf is reachable only through search. This is an existing scope gap.
```
