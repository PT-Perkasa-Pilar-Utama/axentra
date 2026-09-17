---
name: Refactor Safely
description: Plan and execute Axentra refactors with dependency, contract, and test evidence
---

# Refactor Safely

Refactor only with a defined behavior-preservation goal. A refactor must not silently change an API
contract, database schema, authorization decision, queue payload, document access rule, or BA flow.

## Plan

1. Read `CLAUDE.md`, the relevant `docs/` contract, and the existing tests.
2. Define the refactor boundary, preserved behavior, excluded scope, and success criteria.
3. Inspect direct callers, imports, tests, shared contracts, environment configuration, and affected
   migration or queue boundaries with focused `rg` searches and file reads.
4. Check `git status` and `git diff` to avoid overwriting unrelated changes.
5. For a large decomposition, split at a coherent boundary before 300 lines, following
   `docs/CODING_STANDARD.md` and `docs/technical-specs/03-repository-structure.md`.

## Execute

1. Make the smallest coherent change set.
2. Keep public API shapes and user-visible BA wording unchanged unless the task explicitly changes
   them and the relevant docs are updated.
3. Preserve server-side authorization and audit behavior; UI-only changes must not bypass them.
4. Use a forward migration for database changes. Never rewrite an applied shared migration.
5. Update focused tests and docs when the module shape, contract, or operational behavior changes.

## Verify

1. Re-read the changed files and inspect the focused diff.
2. Run the narrowest relevant tests first, then `bun run complete-check` before review.
3. For changed infrastructure boundaries, run `bun run test:integration` with local infrastructure.
4. Report any unavailable dependency as **Blocked**, not **Pass**.

## Optional Knowledge-Graph Tools

When graph tooling is available, start with `get_minimal_context(task="<task>")` and
`detail_level="minimal"`. Then use:

1. `refactor_tool` in `suggest` or `dead_code` mode for discovery.
2. `refactor_tool` in `rename` mode to preview every affected location.
3. `get_impact_radius`, `get_affected_flows`, and `find_large_functions` before a major change.
4. `apply_refactor_tool` only after reviewing the preview edit list.
5. `detect_changes` after the refactor.

Do not use an automatic refactor tool when its preview is incomplete or when the affected contract
cannot be verified.
