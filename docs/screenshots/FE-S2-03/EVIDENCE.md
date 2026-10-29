# Evidence: FE-S2-03 - Automatic categories and download state

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Stale statements: the "AC-05.01 (download inactive)" Fail and the pagination note under "Dokumen Terkait" describe the app as it was during the run. The re-check section marks both as superseded. The first run is kept as history. Usang: perlu diverifikasi ulang pada SHA final.

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
Note:        Defect at the time of this run: the API response for GET /documents/:id includes canDownload, but apps/web did not call that route, so the Download button ignored the category setting. The re-check below records the fix.
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

## Re-check 2026-10-27: download state from canDownload, and related section

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, local worktree of that branch (no SHA recorded), Playwright MCP (Chromium). Same stack and identity setup as the re-check in FE-S3-02/EVIDENCE.md. No application data was changed.

```text
AC:          AC-05.01 (download inactive)
Card:        FE-S2-03 (canDownload re-verification)
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       contract-legal.pdf in category Legal (downloadEnabled=false in DB), the same case that failed in the earlier run
Expected:    Download inactive while the category is disabled, with the denied note shown (the Web app now reads canDownload)
Observed:    Web now reads canDownload from GET /api/v1/documents/:id (false). Download button disabled; note "Akses unduh tidak diizinkan untuk kategori dokumen ini" shown. The earlier Fail for this step no longer reproduces.
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/detail-download-disabled-canDownload-false.png
```

```text
AC:          AC-07.01, AC-07.02 (Dokumen Terkait; first run in docs/screenshots/FE-S2-05/EVIDENCE.md)
Card:        FE-S2-05 (re-check after fix)
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       report-api.pdf detail page; it shares tags (strategy, reporting) with other documents
Expected:    Dokumen Terkait section appears with the related documents and their shared tag
Observed:    Section shows strategy-legal.pdf (tag strategy), sample-a.docx, sample-b.docx and sample-c.docx (tag reporting). Full-page screenshot captured.
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-05/detail-related-after-fix.png
Note:        Superseded. When this check ran, the dashboard list requested page=1&limit=5 and got meta.total=6, but the Next button was hard-disabled (title "Fitur navigasi halaman belum tersedia"), so report-api.pdf was reachable only through search. Pagination has since been added: the FE-S1-02 re-run records "Halaman 1 dari 2" with Next enabled, and the app no longer carries that title text. Repeat this check on the committed SHA. Usang: perlu diverifikasi ulang pada SHA final.
```

## Re-run 2026-10-29

Run: 2026-10-29, detached worktree at commit 2b5152cdcff4b971e032db648cce3a264780e74d, built-in Chromium browser pane of the Claude desktop app, manual flows per docs/E2E_TESTING.md sections 3-6. The code at this commit is identical to a66aef0, 3605cbe, and a02dd05; the evidence commit that adds this section changes only docs/screenshots.

Setup deviations (recorded for the Tech Lead):

- The Playwright MCP server failed to connect, so the built-in browser pane (Chromium) drove the Web UI.
- The browser pane has no file chooser tool. Files were attached to the upload input with a DataTransfer object; the app's change handler, client validation, and upload request ran as for a chosen file.
- Disposable stack on offset ports. Web ran on 5174 because 5173 was held by an unrelated process. Test accounts come from a generated local identity directory; passwords are not recorded.
- For AC-09.01 and AC-10.01, `category_download_permissions.download_enabled` for Reporting was set to true in the disposable DB. The Head of Team toggle is Sprint 4 scope (AC-13.01).
- Screenshots are JPEG captures of the browser pane.

```text
AC:          AC-05.01 (category)
Card:        FE-S2-03
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       report-api.pdf and sample-a/b/c.docx with reporting content
Expected:    New category "Reporting" in the category menu holding the documents
Observed:    Category menu shows Reporting; documents carry category Reporting
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-03/categories-rerun-2026-10-29.jpg
```

```text
AC:          AC-05.01 (download inactive)
Card:        FE-S2-03
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       report-api.pdf detail page before any permission change
Expected:    Download inactive for a new category until Head of Team enables it
Observed:    Download button disabled with "Akses unduh tidak diizinkan untuk kategori dokumen ini"; DB shows download_enabled = false for Contract, Reporting, Strategy
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-03/download-inactive-rerun-2026-10-29.jpg
```

```text
AC:          AC-05.02
Card:        FE-S2-03
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       contract-legal.pdf (legal contract content) and strategy-legal.pdf next to the reporting documents
Expected:    Documents land in different categories by content
Observed:    Categories Contract, Reporting, and Strategy hold different documents
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-03/categories-rerun-2026-10-29.jpg
```
