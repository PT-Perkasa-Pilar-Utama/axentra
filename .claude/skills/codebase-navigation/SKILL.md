---
name: codebase-navigation
description: Navigate the Axentra Bun workspace and trace responsibilities safely.
---

# Axentra codebase navigation

Start with the repository structure and package manifests, then follow the existing owner of a responsibility.

| Area                        | Location                                                 |
| --------------------------- | -------------------------------------------------------- |
| Hono API                    | apps/api/src                                             |
| React/Vite UI               | apps/web/src                                             |
| Worker                      | apps/worker/src                                          |
| Shared contracts            | packages/shared/src                                      |
| PostgreSQL/Drizzle          | packages/db/src                                          |
| Config                      | packages/config/src                                      |
| Queue/storage/observability | packages/queue, packages/storage, packages/observability |

## Trace a request

1. Find the route mounted in apps/api/src/app.ts.
2. Follow its handler/service/repository and schema.
3. Inspect shared response types and request context.
4. Locate tests for the route and its service.
5. For UI, follow React Router -> feature view -> presenter -> API client.

Never assume a file exists or copy conventions from another project. Foundation modules are infrastructure-only until a task card approves business scope. Run bun run complete-check after implementation.
