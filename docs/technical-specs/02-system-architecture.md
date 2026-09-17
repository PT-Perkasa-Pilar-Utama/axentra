# System Architecture

Axentra is a Bun workspace modular monolith with three deployable processes.

```text
React Web -> Hono API on Bun -> PostgreSQL
                            -> S3-compatible Storage
                            -> Redis Queue -> Bun Worker
```

## Runtime Boundaries

| Process | Responsibility                                                           |
| ------- | ------------------------------------------------------------------------ |
| Web     | Browser UI, presenters, views, and API client calls                      |
| API     | HTTP transport, request context, service orchestration, readiness checks |
| Worker  | Queue consumption, asynchronous orchestration, graceful shutdown         |

## Package Boundaries

- Web may import only browser-safe config exports and shared contracts.
- API and Worker may import infrastructure packages.
- Shared code must stay browser-safe.
- Domain code must depend on ports or public services, not another module's internals.
- Storage consumers depend on the `StorageAdapter` contract, not AWS SDK types.
- Feature modules do not read environment variables directly.

## Request Flow

1. Web calls `/api/v1/...` through the centralized API client.
2. API middleware assigns or propagates `x-request-id`.
3. Handler validates transport input and calls one service.
4. Service owns orchestration and transaction boundaries.
5. Repository code owns Drizzle access once domain tables exist.
6. Response helpers return a stable envelope.

## Worker Flow

1. Worker loads validated configuration.
2. Worker checks PostgreSQL, Redis, and Storage before accepting work.
3. Worker consumes versioned queue payloads.
4. Shutdown stops new jobs, waits within a bounded timeout, and closes infrastructure clients.
