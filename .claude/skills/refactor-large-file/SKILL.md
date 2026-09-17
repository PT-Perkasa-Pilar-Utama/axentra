---
name: refactor-large-file
description: Split an oversized Axentra source file without changing behavior.
---

# Refactor an Axentra large file

Use after confirming the responsibility and dependency graph. Preserve the public contract and keep each extracted module focused.

1. Record current behavior and run the existing tests.
2. Extract pure helpers, schemas, repositories, or view components before changing control flow.
3. Keep API routes in apps/api/src/modules, UI feature code in apps/web/src/features, and shared contracts in packages/shared/src.
4. Update imports and tests together; do not move files solely to mimic another project.
5. Run bun run complete-check and review the diff for accidental business-scope changes.

Do not refactor Foundation infrastructure into unapproved domain modules.
