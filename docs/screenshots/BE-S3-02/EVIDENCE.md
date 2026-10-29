# Evidence: BE-S3-02 - Download authorization (denial) and head toggle

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Stale statement: the first record quotes the UI note "Anda tidak memiliki izin mengunduh dokumen ini." after pressing Download. During that run the Web app ignored `canDownload`, so the button stayed enabled and the click ended in the 403. The Web app now reads `canDownload` from `GET /documents/:id`. For a category with download disabled, the detail view disables the button before any click and shows `DOWNLOAD_ACCESS_DENIED_MESSAGE` ("Akses unduh tidak diizinkan untuk kategori dokumen ini"), the same text the API returns in the 403 body. The FE-S3-02 re-check records that state. The 403 body in the first record is still the API contract. The UI note and the click flow need a repeat on the committed SHA. Usang: perlu diverifikasi ulang pada SHA final.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-13.01 precondition (denial)
Card:        BE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       E2E DB: category Reporting download_enabled = false. member_team presses Download on report-api.pdf
Expected:    Download denied with 403 copy; no file
Observed:    HTTP 403 body {"code":"FORBIDDEN","message":"Akses unduh tidak diizinkan untuk kategori dokumen ini"}; UI note "Anda tidak memiliki izin mengunduh dokumen ini."; button disabled; no download event
Result:      Pass
Screenshot:  docs/screenshots/BE-S3-02/download-denied-403.png
Note:        Setting restored to true afterwards (its value before this check). Usang: perlu diverifikasi ulang pada SHA final. UI note pada baris Observed ("Anda tidak memiliki izin mengunduh dokumen ini.") tidak sama dengan DOWNLOAD_ACCESS_DENIED_MESSAGE.
```

```text
AC:          AC-13.01
Card:        BE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head@axentra.internal)
Input:       Head of Team toggles the category download permission in the UI
Expected:    Toggle present and effective
Observed:    Not run. apps/web has no category-permission UI (only the API side exists)
Result:      Blocked
Screenshot:  No screenshot
Note:        Dependency missing: Web UI for the permission toggle.
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
AC:          AC-13.01 precondition (denial)
Card:        BE-S3-02
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       report-api.pdf detail page with Reporting download_enabled = false
Expected:    Download not possible for a disabled category
Observed:    Download button disabled before any click with "Akses unduh tidak diizinkan untuk kategori dokumen ini"
Result:      Pass
Screenshot:  docs/screenshots/BE-S3-02/download-disabled-before-click-rerun-2026-10-29.jpg
Note:        The server-side 403 for a direct API call was not repeated in the browser in this run; test/document-download.integration.test.ts covers it (84/0 at this code).
```

```text
AC:          AC-13.01
Card:        BE-S3-02
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head.r2@local.test)
Input:       Head of Team toggles the category download permission in the UI
Expected:    Toggle present and effective
Observed:    No toggle in the Web UI
Result:      Blocked
Screenshot:  No screenshot (no toggle exists)
Note:        Sprint 4 cards BE-S4-03, BE-S4-04, FE-S4-03 deliver the toggle.
```
