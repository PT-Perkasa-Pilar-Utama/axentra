# Evidence: FE-S3-03 - Bulk download

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-10.01
Card:        FE-S3-03
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Dashboard: select report-api.pdf and sample-a.docx, press Download Selected
Expected:    One .zip containing both files, download starts
Observed:    Button label "Download Selected". One download, suggested name documents.zip, containing report-api.pdf (572 bytes) and sample-a.docx (919 bytes); zip integrity test passed
Result:      Pass
Screenshot:  No screenshot (download artifact; entries listed above)
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
AC:          AC-10.01
Card:        FE-S3-03
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       Dashboard: select sample-a.docx and sample-b.docx (Reporting, enabled), press Download Selected
Expected:    One .zip containing the selected files, download starts
Observed:    POST /api/v1/documents/bulk-download 200; Content-Type application/zip; Content-Disposition attachment; filename=axentra-documents.zip; Transfer-Encoding chunked, no Content-Length; 2048 bytes starting with PK; entries sample-a.docx and sample-b.docx; selection cleared after download. download_audit_events rows: 5 for the run (1 single, 2 bulk requests x 2 documents)
Result:      Pass
Screenshot:  No screenshot (the browser pane rendered the dashboard cropped; the response was captured in the page)
```
