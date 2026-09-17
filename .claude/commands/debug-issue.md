---
name: Debug Issue
description: Systematically diagnose an Axentra issue with focused code navigation and evidence
---

# Debug Issue

Diagnose issues methodically. Treat the reported behavior as evidence to investigate, not proof of
the assumed cause. Do not implement a fix unless the task explicitly asks for one.

## Before You Start

1. Read `CLAUDE.md` and the relevant Axentra documentation.
2. Capture the environment, Task ID/module, user persona, exact error, reproduction steps, and
   expected behavior.
3. Check `docs/TROUBLESHOOTING_GUIDE.md` for an existing diagnosis before exploring the code.
4. Redact credentials, document contents, signed URLs, and object keys from all evidence.

## Investigation Steps

1. Start from the symptom using `rg` to locate the route, feature, error message, config key, or
   job name.
2. Trace the request path through the applicable boundary:
   - Web: `apps/web/src/features/` API -> Presenter -> View.
   - API: `apps/api/src/modules/` route -> handler -> service -> repository.
   - Worker: `apps/worker/` -> queue boundary -> job handler.
   - Infrastructure: `packages/config`, `packages/db`, `packages/queue`, `packages/storage`, and
     `infra/local/`.
3. Read the relevant API contract and acceptance criteria before judging behavior:
   `docs/api-specs/`, `docs/business/`, and `docs/technical-specs/`.
4. Inspect recent changes with `git status`, `git log`, and focused `git diff` for the suspected
   files.
5. Identify the impact radius: direct callers, shared contracts, migrations, configuration, queue
   payloads, Web API clients, tests, and linked acceptance criteria.
6. Reproduce using the smallest safe command or test. If an external dependency is unavailable,
   report the result as **Blocked**, not **Pass**.

## Optional Knowledge-Graph Tools

Use graph tooling only when it is actually available in the current environment. Start with
`get_minimal_context(task="<task>")`, request `detail_level="minimal"`, and expand only when the
minimal result is insufficient.

Suggested order:

1. `semantic_search_nodes` for the route, feature, error, or domain term.
2. `query_graph` with callers/callees for the suspected function.
3. `get_flow` for the end-to-end execution path.
4. `detect_changes` for likely regressions.
5. `get_impact_radius` before proposing a fix.

Without graph tooling, use the repository layout and focused `rg` searches above; never claim graph
evidence that was not obtained.

## Report Format

Return a concise, evidence-backed report:

1. **Status:** confirmed, not reproduced, or blocked.
2. **Observed behavior:** exact symptom and environment.
3. **Root cause:** confirmed cause, or the most likely hypothesis clearly labeled as such.
4. **Evidence:** relevant file paths, line numbers, commands, logs, and failed/passed checks.
5. **Impact:** affected modules, personas, API contracts, data, and acceptance criteria.
6. **Next action:** smallest safe remediation and verification steps. Do not perform destructive
   recovery without Arya Isnaidi's Tech Lead approval.

## Efficiency Rules

- Read the smallest useful context first; do not dump whole folders or logs.
- Prefer a few focused searches over broad scans.
- Separate source-code evidence from runtime proof.
- Stop once the cause is confirmed or the next required evidence is clearly identified.
