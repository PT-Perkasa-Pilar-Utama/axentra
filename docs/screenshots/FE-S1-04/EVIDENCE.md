# Evidence: FE-S1-04 - Duplicate detection

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Stale statements: the Web app no longer prefixes upload toasts with "Unggah berhasil." or "Unggah gagal.". The Observed lines for AC-02.01 and AC-02.03, and the screenshots `duplicate-error.png` and `non-duplicate-toast.png`, show that removed copy. The toast now carries the BA text alone: `File ini sudah ada` and `File diterima untuk diproses` (see `document-upload.rules.ts` and `document-upload.state.ts` under `apps/web/src/features/document-upload/`). The AC-02.02 Observed line describes list contents and does not depend on the copy, but its screenshot is `duplicate-error.png`. The Result lines below do not count as current evidence until the flows run again. Usang: perlu diverifikasi ulang pada SHA final.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-02.01
Card:        FE-S1-04
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       duplicate-report.pdf (cmp-verified byte-identical to report-api.pdf)
Expected:    Error "File ini sudah ada"; no new document
Observed:    Toast "Unggah gagal. File ini sudah ada"; API returned 409 on POST /documents/upload
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-04/duplicate-error.png
```

```text
AC:          AC-02.02
Card:        FE-S1-04
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Same duplicate upload, then check the recent list
Expected:    Duplicate is not in the recent list
Observed:    List holds only the original documents; no duplicate-report.pdf entry
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-04/duplicate-error.png
```

```text
AC:          AC-02.03
Card:        FE-S1-04
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       contract-legal.pdf (different content). Note: the AC names presentasi-baru.pdf; contract-legal.pdf was used as the non-duplicate
Expected:    Success "File diterima untuk diproses"
Observed:    Toast "Unggah berhasil. File diterima untuk diproses"; contract-legal.pdf processed
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-04/non-duplicate-toast.png
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
AC:          AC-02.01, AC-02.02
Card:        FE-S1-04
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       duplicate-report.pdf (byte-identical to report-api.pdf, checked with cmp)
Expected:    Error "File ini sudah ada"; duplicate not in the recent list
Observed:    Toast "File ini sudah ada"; list unchanged (four documents, no duplicate-report.pdf)
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-04/duplicate-error-rerun-2026-10-29.jpg
```

```text
AC:          AC-02.03
Card:        FE-S1-04
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       contract-legal.pdf (different content)
Expected:    Success "File diterima untuk diproses"
Observed:    Toast "File diterima untuk diproses"; contract-legal.pdf listed
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-04/non-duplicate-toast-rerun-2026-10-29.jpg
Note:        The AC names presentasi-baru.pdf; contract-legal.pdf was used as the non-duplicate.
```
