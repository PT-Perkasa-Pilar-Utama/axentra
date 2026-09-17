# Repository Structure

```text
axentra/
|-- apps/
|   |-- api/                 Hono API process
|   |-- web/                 React/Vite Web shell
|   `-- worker/              BullMQ Worker process
|-- packages/
|   |-- config/              Typed runtime configuration
|   |-- db/                  Drizzle and PostgreSQL boundary
|   |-- observability/       Pino logging, redaction, correlation helpers
|   |-- queue/               Redis and BullMQ boundary
|   |-- shared/              Browser-safe contracts and schemas
|   `-- storage/             MinIO/AWS S3-compatible boundary
|-- docs/                    Product, technical, API, and operational documentation
|-- infra/local/             Local Docker Compose infrastructure
|-- test/                    Integration tests
|-- .github/workflows/       CI workflows
`-- .husky/                  Git hooks
```

## Naming Rules

- Files and directories use `kebab-case`.
- Components and classes use `PascalCase`.
- Functions and variables use `camelCase`.
- Production files should stay near 250 lines; over 300 lines requires PR justification.

## Future Module Shape

Backend modules should follow:

```text
apps/api/src/modules/<module>/
  <module>.routes.ts
  <module>.handler.ts
  <module>.service.ts
  <module>.repository.ts
  <module>.schema.ts
  <module>.test.ts
```

Frontend features should follow:

```text
apps/web/src/features/<feature>/
  <feature>.api.ts
  <feature>.presenter.ts
  <feature>.view.tsx
```
