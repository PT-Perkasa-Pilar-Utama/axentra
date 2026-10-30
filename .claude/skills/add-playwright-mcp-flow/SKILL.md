---
name: add-playwright-mcp-flow
description: Run and record an approved Axentra UI acceptance flow through the Playwright MCP.
---

# Run an Axentra acceptance flow with Playwright MCP

Use only for an acceptance criterion that requires browser-visible behavior. The web app runs through Vite and React Router; the API and worker run through the documented local commands.

- Install and check the Playwright MCP first: see the "E2E: Playwright MCP (instalasi lokal)" section in CLAUDE.md.
- Run the flow against a local stack started with the documented commands, or against the Test environment with seeded, non-production accounts. Run destructive resets only on a disposable database, never on a production-like environment (docs/E2E_TESTING.md, section 8.3).
- Use seeded, non-production accounts from the local identity directory. Never use production credentials.
- Assert user-visible text, navigation, and persisted outcomes; do not assert implementation details.
- Record evidence under `docs/screenshots/<CARD-ID>/`: a screenshot for each step that carries the AC, and the observed result. Record the environment, role, input, expected result, and observed result, as described in docs/E2E_TESTING.md.
- Add a negative or error path when the AC requires one.
- Mark a flow `Blocked`, not `Pass`, when a dependency is unavailable. Do not mark any flow passed without the recorded evidence.

After the flow has run, run `bun run complete-check` for the code change. Document any unavailable external dependency as unverified, not passed.
