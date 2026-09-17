---
name: add-api-endpoint
description: Add a Foundation-compatible Hono API endpoint in Axentra.
---

# Add an Axentra API endpoint

Use this skill only after the task card, acceptance criteria, and module boundary are understood. Axentra is a Bun workspace with a Hono API.

## Structure

Create the smallest module that owns the responsibility under:

```
apps/api/src/modules/<module>/<module>.routes.ts
apps/api/src/modules/<module>/<module>.service.ts
apps/api/src/modules/<module>/<module>.repository.ts
apps/api/src/modules/<module>/<module>.schema.ts
apps/api/src/modules/<module>/<module>.test.ts
```

Mount the routes from `apps/api/src/app.ts`. Keep transport parsing in routes, business decisions in services, persistence in repositories, and Zod validation in schemas. Use the shared response helpers and never return raw secrets or database errors.

## Required workflow

1. Confirm the task card and acceptance criteria. Do not invent business tables in Foundation work.
2. Inspect existing modules and shared types before adding a new abstraction.
3. Validate params, query, and JSON body with Zod; return the project error envelope on failure.
4. Add unit/integration coverage for success, validation failure, authorization, and persistence conflict paths.
5. Register the route and prove it through the API test harness.
6. Run `bun run complete-check` before opening the PR.

## Review checklist

- [ ] Endpoint is mounted exactly once and uses the `/api/v1` prefix.
- [ ] Authentication/RBAC and request context are enforced server-side.
- [ ] Tenant/branch identifiers are derived from trusted context, never accepted as an authority from the browser.
- [ ] Responses use the documented success/error envelope.
- [ ] Mutations are transaction-safe and have an audit-log task when the acceptance criteria require it.
- [ ] Tests cover the acceptance criteria and do not rely on production services.
