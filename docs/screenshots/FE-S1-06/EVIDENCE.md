# Evidence: FE-S1-06 - Login lockout

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          FE-S1-06 lockout (5 wrong attempts)
Card:        FE-S1-06
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        none (unauthenticated) against admin@axentra.internal
Input:       admin@axentra.internal, 5 wrong passwords, then a 6th attempt (admin only, to keep the member account free)
Expected:    Lock after five wrong attempts with the 429 copy
Observed:    Attempts 1-5: HTTP 401 "Email atau kata sandi salah". Attempt 6: HTTP 429 "Terlalu banyak percobaan masuk. Silakan coba beberapa saat lagi."
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-06/login-lockout-429.png
Note:        auth.policy.ts sets lockedUntil when the 5th failure is recorded, so the lock is observed on the next attempt. Member login was not affected afterwards.
```
