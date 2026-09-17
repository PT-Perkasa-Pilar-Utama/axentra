# Environment Configuration

Configuration is owned by `packages/config`.

## Local Environment

Copy `.env.example` to `.env`.

```powershell
Copy-Item .env.example .env
```

## Variables

| Variable                     | Process                | Purpose                                            |
| ---------------------------- | ---------------------- | -------------------------------------------------- |
| `APP_ENV`                    | API, Worker            | Runtime environment                                |
| `APP_VERSION`                | API, Worker            | Version reported in logs and health                |
| `LOG_LEVEL`                  | API, Worker            | Pino log level                                     |
| `REDIS_HEALTH_TIMEOUT_MS`    | API, Worker            | Maximum Redis startup/readiness probe duration     |
| `VITE_API_BASE_URL`          | Web                    | Browser-safe API base URL                          |
| `API_PORT`                   | API                    | Bun server port                                    |
| `API_SHUTDOWN_TIMEOUT_MS`    | API                    | Resource cleanup deadline on shutdown              |
| `DATABASE_URL`               | API, Worker, DB CLI    | PostgreSQL connection                              |
| `REDIS_URL`                  | API, Worker            | Redis connection                                   |
| `QUEUE_NAME`                 | Worker, queue producer | BullMQ queue name                                  |
| `WORKER_CONCURRENCY`         | Worker                 | Worker concurrency                                 |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | Worker                 | Graceful shutdown deadline                         |
| `S3_PROVIDER`                | API, Worker            | `minio` or `s3`                                    |
| `S3_ENDPOINT`                | API, Worker            | Required for MinIO, empty for AWS default endpoint |
| `S3_REGION`                  | API, Worker            | Object storage region                              |
| `S3_BUCKET`                  | API, Worker            | Bucket name                                        |
| `S3_ACCESS_KEY_ID`           | API, Worker            | Local MinIO or secure runtime credential           |
| `S3_SECRET_ACCESS_KEY`       | API, Worker            | Local MinIO or secure runtime credential           |
| `S3_FORCE_PATH_STYLE`        | API, Worker            | `true` for MinIO, usually `false` for S3           |

## Rules

- Do not read environment variables directly in feature modules.
- Do not expose server secrets through `VITE_*`.
- Do not commit `.env`.
- Production credentials must come from secure infrastructure configuration.
