# Environment Configuration

Configuration is owned by `packages/config`.

## Local Environment

Copy `.env.example` to `.env`.

```powershell
Copy-Item .env.example .env
```

`AUTH_LOCAL_IDENTITY_DIRECTORY` is intentionally blank in `.env.example`. Before running
`bun run db:seed` or starting the API in development/test, populate it in the ignored local
`.env` file. Use a Base64-encoded JSON array of records shaped as
`{ id, email, role, name?, passwordHash }`; generate each Argon2id verifier locally with
`Bun.password.hash(password, { algorithm: "argon2id" })`. Encode with `Buffer.from(JSON.stringify(records)).toString("base64")`
and write the result only to `.env`. The API and `db:seed` use this same directory. Do not put passwords or
verifiers in tracked files, shell history, or logs. Production auth ignores the directory, but the
environment variable must still be non-empty.

## Variables

| Variable                        | Process                | Purpose                                                    |
| ------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `APP_ENV`                       | API, Worker            | Runtime environment                                        |
| `APP_VERSION`                   | API, Worker            | Version reported in logs and health                        |
| `LOG_LEVEL`                     | API, Worker            | Pino log level                                             |
| `REDIS_HEALTH_TIMEOUT_MS`       | API, Worker            | Maximum Redis startup/readiness probe duration             |
| `VITE_API_BASE_URL`             | Web                    | Browser-safe API base URL                                  |
| `API_PORT`                      | API                    | Bun server port                                            |
| `API_SHUTDOWN_TIMEOUT_MS`       | API                    | Resource cleanup deadline on shutdown                      |
| `AUTH_LOCAL_IDENTITY_DIRECTORY` | API                    | Development/test identity directory; ignored in production |
| `DATABASE_URL`                  | API, Worker, DB CLI    | PostgreSQL connection                                      |
| `REDIS_URL`                     | API, Worker            | Redis connection                                           |
| `QUEUE_NAME`                    | Worker, queue producer | BullMQ queue name                                          |
| `WORKER_CONCURRENCY`            | Worker                 | Worker concurrency                                         |
| `WORKER_SHUTDOWN_TIMEOUT_MS`    | Worker                 | Graceful shutdown deadline                                 |
| `S3_PROVIDER`                   | API, Worker            | `minio` or `s3`                                            |
| `S3_ENDPOINT`                   | API, Worker            | Required for MinIO, empty for AWS default endpoint         |
| `S3_REGION`                     | API, Worker            | Object storage region                                      |
| `S3_BUCKET`                     | API, Worker            | Bucket name                                                |
| `S3_ACCESS_KEY_ID`              | API, Worker            | Local MinIO or secure runtime credential                   |
| `S3_SECRET_ACCESS_KEY`          | API, Worker            | Local MinIO or secure runtime credential                   |
| `S3_FORCE_PATH_STYLE`           | API, Worker            | `true` for MinIO, usually `false` for S3                   |

## Rules

- Do not read environment variables directly in feature modules.
- Do not expose server secrets through `VITE_*`.
- Do not commit `.env`.
- Production credentials must come from secure infrastructure configuration.
