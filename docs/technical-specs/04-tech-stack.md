# Tech Stack

| Layer           | Technology                                              |
| --------------- | ------------------------------------------------------- |
| Runtime         | Bun 1.3.12                                              |
| Language        | TypeScript strict                                       |
| Web             | React, Vite, React Router                               |
| Server state    | TanStack Query                                          |
| Forms           | React Hook Form and Zod                                 |
| Styling         | Tailwind CSS                                            |
| API             | Hono on Bun                                             |
| Worker          | Bun process with BullMQ                                 |
| Database        | PostgreSQL and Drizzle                                  |
| Queue           | Redis and BullMQ                                        |
| Storage         | MinIO locally, AWS S3-compatible provider in production |
| Logging         | Pino                                                    |
| Tests           | `bun:test`                                              |
| Lint and format | Oxlint and Oxfmt                                        |
| CI              | GitHub Actions                                          |

## Runtime Policy

- Bun is the runtime and package manager.
- Do not introduce npm, pnpm, or yarn lockfiles.
- Add dependencies only when they solve a concrete implementation need.
- Browser code must not import server-only packages.

## Build Outputs

| Command                    | Output                                                 |
| -------------------------- | ------------------------------------------------------ |
| `bun run build`            | Builds Web, API, and Worker                            |
| `bun run complete-check`   | Runs type-check, lint, format check, tests, and build  |
| `bun run test:integration` | Verifies real PostgreSQL, Redis, and MinIO/S3 boundary |
