# Evidence: FE-S1-01 - Upload panel and role gate

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Stale statements: the Web app no longer prefixes upload toasts with "Unggah berhasil." or "Unggah gagal.". The Observed lines below, and the screenshots `upload-toast.png`, `unsupported-type.png`, and `multi-docx-toast.png`, show that removed copy. The toast now carries the BA text alone: `File diterima untuk diproses` (a multi-file upload appends `: <file names>`) and `Tipe file tidak didukung` (see `document-upload.rules.ts` and `document-upload.state.ts` under `apps/web/src/features/document-upload/`). The Result lines below do not count as current evidence for AC-01.01, AC-01.03, and AC-01.04 until the flows run again. Usang: perlu diverifikasi ulang pada SHA final.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-01.01
Card:        FE-S1-01
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       report-api.pdf (synthetic PDF, /Author Test Author, body 'API reporting strategy overview')
Expected:    Toast "File diterima untuk diproses"; file appears after processing
Observed:    Toast "Unggah berhasil. File diterima untuk diproses"; report-api.pdf listed as "Selesai Diproses" with tags report, reporting, strategy
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/upload-toast.png
```

```text
AC:          AC-01.03
Card:        FE-S1-01
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       image.jpg (synthetic JPEG, lowercase extension)
Expected:    Error "Tipe file tidak didukung"
Observed:    Toast "Unggah gagal. Tipe file tidak didukung"
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/unsupported-type.png
Note:        AC text uses .JPG; the uppercase extension was not separately tested.
```

```text
AC:          AC-01.04
Card:        FE-S1-01
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       sample-a.docx, sample-b.docx, sample-c.docx selected together (synthetic minimal DOCX packages)
Expected:    One success notification covering all three files; all three appear
Observed:    One toast "Unggah berhasil. File diterima untuk diproses" listing sample-a.docx, sample-b.docx, sample-c.docx; all three appear and reach "Selesai Diproses"
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/multi-docx-toast.png
```

```text
AC:          FE-S1-01 role gate (Head of Team has no upload panel)
Card:        FE-S1-01
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head@axentra.internal)
Input:       Login as head_of_team, open dashboard
Expected:    No upload panel on the dashboard
Observed:    No "Area Unggah Dokumen" region and no upload button in the DOM
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/head-no-upload-panel.png
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
AC:          AC-01.01
Card:        FE-S1-01
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       report-api.pdf (synthetic PDF, /Author Test Author, body 'API reporting strategy overview')
Expected:    Toast "File diterima untuk diproses"; file appears after processing
Observed:    Toast "File diterima untuk diproses"; report-api.pdf listed as "Dalam Antrean", then "Selesai Diproses" with tags report, reporting, strategy
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/upload-toast-rerun-2026-10-29.jpg, docs/screenshots/FE-S1-01/upload-processed-rerun-2026-10-29.jpg
```

```text
AC:          AC-01.03
Card:        FE-S1-01
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       image.jpg (synthetic JPEG, lowercase extension)
Expected:    Error "Tipe file tidak didukung"
Observed:    Toast "Tipe file tidak didukung"; no document added
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/unsupported-type-rerun-2026-10-29.jpg
Note:        AC text uses .JPG; an uppercase IMAGE.JPG was also attached, but its toast could not be told apart from the previous one, so it is not counted.
```

```text
AC:          AC-01.04
Card:        FE-S1-01
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       sample-a.docx, sample-b.docx, sample-c.docx attached together (synthetic minimal DOCX)
Expected:    One success notification covering all three files; all three appear
Observed:    One toast "File diterima untuk diproses: sample-a.docx, sample-b.docx, sample-c.docx"; all three reach "Selesai Diproses" with tags reporting, sample
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/multi-docx-toast-rerun-2026-10-29.jpg, docs/screenshots/FE-S1-01/multi-docx-processed-rerun-2026-10-29.jpg
Note:        The coverage table words AC-01.04 as a notification for each file; the app shows one toast that names all three.
```

```text
AC:          FE-S1-01 role gate (Head of Team has no upload panel)
Card:        FE-S1-01
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head.r2@local.test)
Input:       Login as head_of_team, open dashboard
Expected:    No upload panel on the dashboard
Observed:    No upload region and no file input in the DOM; document list shown
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/head-no-upload-panel-rerun-2026-10-29.jpg
```
