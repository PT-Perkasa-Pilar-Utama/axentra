# Non-Functional Requirements

## Availability

- API liveness must not perform dependency I/O.
- API readiness must check PostgreSQL, Redis, and Storage with bounded timeouts.
- Worker startup must validate infrastructure before accepting jobs.
- Worker shutdown must stop accepting jobs and close clients within a bounded deadline.

## Performance

| Area             | Requirement                                             |
| ---------------- | ------------------------------------------------------- |
| API health       | Fast enough for orchestrator probes                     |
| Readiness checks | Bounded at the dependency check level                   |
| Web shell        | Buildable through Vite and suitable for browser caching |
| Queue jobs       | Carry identifiers and fetch data as needed              |

## Observability

- API logs include request ID.
- Worker logs include job ID.
- Logs include service name, environment, and version.
- Errors are sanitized before leaving process boundaries.

## Maintainability

- Strict TypeScript is required.
- `any` and `@ts-ignore` are not allowed.
- New modules must follow the documented package and feature boundaries.
- `bun run complete-check` is the baseline quality gate.
