# Integration Points

## Implemented Integrations

| Integration           | Purpose                        | Local Provider        |
| --------------------- | ------------------------------ | --------------------- |
| PostgreSQL            | Relational data and migrations | Docker Compose        |
| Redis                 | Queue transport and probes     | Docker Compose        |
| S3-compatible storage | Object storage                 | MinIO                 |
| GitHub Actions        | CI gates                       | GitHub-hosted runners |

## Planned Integrations

| Integration                        | Status   |
| ---------------------------------- | -------- |
| OCR engine                         | Deferred |
| AI extraction or classification    | Deferred |
| Email or notification provider     | Deferred |
| Enterprise identity provider       | Deferred |
| External document signing provider | Deferred |

## Storage Policy

- Local development uses MinIO.
- Production uses assigned private object storage.
- Application code may create the local MinIO bucket.
- Application code must not create the production bucket.
- Signed download URLs must use bounded TTL values.
