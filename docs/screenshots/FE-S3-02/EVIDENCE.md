# Evidence: FE-S3-02 - Single download from preview

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-09.01
Card:        FE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Preview page of report-api.pdf, press Download. Precondition: Reporting download_enabled set to true in the E2E DB
Expected:    File downloads in original format
Observed:    Browser download report-api.pdf: 572 bytes, starts with %PDF-1.4, byte-identical to the fixture (sha256 starts 4f273a2d). Copy kept outside the repo.
Result:      Pass
Screenshot:  No screenshot (download artifact; hash above)
Note:        Before the precondition was set, the same click returned 403 (see BE-S3-02).
```

## Re-check 2026-10-27: download control driven by canDownload

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, local worktree of that branch (no SHA recorded), Playwright MCP (Chromium). Stack started from the worktree root with the same DB, Redis, MinIO and identity setup as above. Web is reached at http://localhost:5174 (Vite listens on the IPv6 loopback). No application data was changed. Clicking Download on report-api.pdf is a read-only file GET.

```text
AC:          AC-09.01 (download control follows canDownload)
Card:        FE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       contract-legal.pdf (category Legal, downloadEnabled=false in DB), detail page opened in the browser
Expected:    Download button disabled; note "Akses unduh tidak diizinkan untuk kategori dokumen ini"; upload date, at most three tags, and category shown
Observed:    GET /api/v1/documents/41393bea-0fc5-4276-8068-fb701a5aa3df returned canDownload=false (category.downloadEnabled=false). Download button disabled; denied note shown. Category Legal, upload date 27/10/2026, two tags (contract, legal).
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/detail-download-disabled-canDownload-false.png
```

```text
AC:          AC-09.01 (download enabled)
Card:        FE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       report-api.pdf (category Reporting, downloadEnabled=true in DB), detail page, then Download clicked
Expected:    Download button enabled; a file downloads in original format
Observed:    Button enabled with note "Unduh dalam format asli". GET /api/v1/documents/444acf93-499b-4c8e-a30f-0275dbd8db23/download returned 200. Browser download report-api.pdf: 572 bytes, starts with %PDF-, sha256 4f273a2d... identical to the fixture e2e-fixtures/report-api.pdf. Download copy kept outside the repo.
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/detail-download-enabled.png
```

```text
AC:          AC-09.01 (head_of_team sees all categories)
Card:        FE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head@axentra.internal)
Input:       contract-legal.pdf detail page (category Legal, downloadEnabled=false). Download was not clicked and no data was changed.
Expected:    Download button enabled (head_of_team sees all categories per the server rule)
Observed:    GET /api/v1/documents/41393bea-0fc5-4276-8068-fb701a5aa3df returned canDownload=true while category.downloadEnabled stayed false. Download button enabled with note "Unduh dalam format asli".
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/detail-download-enabled-head-of-team.png
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
AC:          AC-09.01 (download control follows canDownload)
Card:        FE-S3-02
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       contract-legal.pdf detail page (category Contract, download_enabled = false)
Expected:    Download disabled with "Akses unduh tidak diizinkan untuk kategori dokumen ini"
Observed:    Download button disabled with that note; no download request
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/download-denied-contract-rerun-2026-10-29.jpg
```

```text
AC:          AC-09.01 (download enabled)
Card:        FE-S3-02
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       report-api.pdf detail page after Reporting download_enabled = true, Download clicked
Expected:    File downloads in original format
Observed:    GET /api/v1/documents/:id/download returned 200 with a signed URL (TTL 300 s, not recorded). The object served Content-Type application/pdf, Content-Disposition attachment; filename=report-api.pdf, and was byte-identical to the fixture (cmp)
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/download-enabled-rerun-2026-10-29.jpg
```

```text
AC:          AC-09.01 (head_of_team sees all categories)
Card:        FE-S3-02
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head.r2@local.test)
Input:       contract-legal.pdf detail page as head_of_team
Expected:    Download enabled
Observed:    Download enabled with "Unduh dalam format asli"
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-02/head-download-enabled-rerun-2026-10-29.jpg
```
