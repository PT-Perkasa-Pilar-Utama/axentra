# Evidence: FE-S1-05 - Login

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: a02dd05

Catatan SHA: Alur walkthrough diverifikasi pada commit a02dd05 (Bun 1.4.3).

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          FE-S1-05 valid login
Card:        FE-S1-05
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       member@axentra.internal with correct test password
Expected:    Dashboard reached
Observed:    URL /dashboard, page title Dashboard | Axentra
Result:      Pass
Screenshot:  No screenshot (see FE-S1-01 dashboard screenshots)
Note:        The first attempt in the run returned 401 because the .env identity hash did not match the known password; resolved by the shell override described above before this record.
```

```text
AC:          FE-S1-05 wrong password
Card:        FE-S1-05
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        none (unauthenticated)
Input:       member@axentra.internal with a wrong password
Expected:    Error shown, stays on login
Observed:    Alert "Email atau kata sandi salah", URL /login
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-05/login-wrong-password.png
```
