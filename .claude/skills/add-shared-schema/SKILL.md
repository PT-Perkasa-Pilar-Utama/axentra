---
name: add-shared-schema
description: Add a cross-package Axentra contract without duplicating literals.
---

# Add shared schema

Use packages/shared/src for stable API contracts, response envelopes, enums, and Zod schemas consumed by more than one package. Keep feature-only validation next to the feature.

1. Confirm the task and compatibility impact.
2. Add the literal, schema, or type in the smallest shared file and export it from packages/shared/src/index.ts.
3. Add tests for valid and invalid values.
4. Update API and UI consumers in the same PR.
5. Run bun run complete-check.

Do not import app-specific modules into shared, duplicate an existing literal, or add unapproved business-domain scope to Foundation.
