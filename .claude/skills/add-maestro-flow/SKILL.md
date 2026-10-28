---
name: add-maestro-flow
description: Add a Maestro flow for an approved Axentra UI acceptance criterion.
---

# Add an Axentra Maestro flow

Use only for an acceptance criterion that requires browser-visible behavior. Axentra web runs through Vite and React Router.

- Place flows under e2e/maestro/ with a stable descriptive filename.
- Start the API and web app using the documented local commands.
- Use seeded, non-production credentials from test configuration only.
- Assert user-visible text, navigation, and persisted outcomes; do not assert implementation details.
- Keep cleanup deterministic and add a negative/error path when the acceptance criterion requires it.

Run the flow locally and then bun run complete-check. Document any unavailable external dependency as unverified, not passed.
