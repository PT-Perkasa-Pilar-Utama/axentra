# Evidence: FE-S1-01 - Upload panel and role gate

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
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
AC:          FE-S1-01 role gate (D8)
Card:        FE-S1-01
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head@axentra.internal)
Input:       Login as head_of_team, open dashboard
Expected:    No upload panel on the dashboard
Observed:    No "Area Unggah Dokumen" region and no upload button in the DOM
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-01/head-no-upload-panel.png
```
