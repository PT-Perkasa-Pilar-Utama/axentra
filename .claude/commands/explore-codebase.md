---
name: Explore Codebase
description: Navigate and understand Axentra with focused architecture and dependency tracing
---

# Explore Codebase

Explore the codebase from its architecture toward the smallest relevant implementation area. Do not
infer a module, endpoint, or business behavior before checking the authoritative Axentra docs.

## Exploration Steps

1. Read `CLAUDE.md`, then identify the relevant source of truth:
   - Product and ACs: `docs/business/`.
   - API contracts: `docs/api-specs/`.
   - Architecture and data model: `docs/technical-specs/`.
2. Start with the repository shape using `rg --files`, then narrow to the relevant process:
   - Web: `apps/web/src/features/` and `apps/web/src/lib/`.
   - API: `apps/api/src/modules/`.
   - Worker: `apps/worker/` and `packages/queue/`.
   - Infrastructure: `packages/config`, `packages/db`, `packages/storage`, and `infra/local/`.
3. Search precise terms with `rg`: route path, error code, domain term, queue name, configuration
   variable, or acceptance-criterion ID.
4. Trace the applicable flow:
   - Web: API client -> Presenter -> View.
   - API: route -> handler -> service -> repository.
   - Async: API/service -> queue -> Worker handler -> storage/database boundary.
5. Read existing tests and the nearest comparable implementation before proposing a change.
6. State the observed architecture, entry point, dependency path, and open questions with file-path
   evidence.

## Optional Knowledge-Graph Tools

Use graph tooling only when it exists in the active environment. Start with
`get_minimal_context(task="<task>")` and `detail_level="minimal"`.

Suggested sequence:

1. `list_graph_stats` and `get_architecture_overview` for a broad map.
2. `list_communities` and `get_community` for the relevant module.
3. `semantic_search_nodes` for a route, function, class, or domain term.
4. `query_graph` with callers, callees, imports, or children patterns.
5. `list_flows` and `get_flow` for full execution paths.

Never report graph findings when no graph tool was available. Use `rg`, focused file reads, and Git
history as the fallback evidence.

## Efficiency Rules

- Start broad only long enough to choose the correct process, then narrow.
- Request minimal context/output first and expand only when it changes the decision.
- Read relevant files, not entire folders.
- Distinguish implemented Foundation behavior from planned BA scope.
