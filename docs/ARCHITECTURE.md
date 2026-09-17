# Axentra Architecture

**Version:** 0.1.0  
**Status:** Foundation active

Axentra is a Bun workspace modular monolith with three deployable processes: Web, API, and
Worker.

```text
React Web -> Hono API on Bun -> PostgreSQL
                            -> S3-compatible Storage
                            -> Redis Queue -> Bun Worker
```

## Decision

Foundation v0.1.0 establishes runtime and package boundaries before business features are added.
The current system exposes only operational health endpoints and a Web foundation shell.

## Package Boundaries

- Web may import only browser-safe config exports and shared contracts.
- API and Worker may import infrastructure packages.
- `shared` cannot import server-only code.
- Services contain application rules and transaction ownership.
- Handlers translate HTTP only.
- Repositories contain Drizzle access only once domain tables exist.
- Domain code depends on the Storage contract, never AWS SDK types.
- Cross-module access uses a public service or port, never another module's internals.

## API Contracts

- Prefix: `/api/v1`.
- `GET /health` reports process liveness without dependency I/O.
- `GET /health/ready` checks PostgreSQL, Redis, and Storage with bounded timeouts.
- Errors are sanitized and use stable English codes with Indonesian user messages.

## Worker Contract

The Worker validates configuration and infrastructure before accepting queue work. Shutdown stops
new jobs, waits within a bounded deadline, then closes queue, database, Redis, and storage clients.
Jobs carry identifiers and versioned payloads, never document contents.

## Storage

Local development uses MinIO. Production uses the assigned private S3-compatible bucket.
Production credentials are supplied only by secure infrastructure configuration; IAM role or
workload identity is preferred.

## Excluded From Foundation

Authentication, RBAC business logic, upload, duplicate detection, OCR, AI, search, preview,
downloads, analytics, audit business behavior, permissions, and the complete domain schema.

## Detailed Specs

See [technical-specs/\_index.md](technical-specs/_index.md) for the full technical specification
set.
