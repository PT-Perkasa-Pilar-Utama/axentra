---
name: add-frontend-feature
description: Build a React/Vite feature in Axentra with real API-backed behavior.
---

# Add an Axentra frontend feature

Axentra uses React, Vite, TypeScript, and React Router. Features live under apps/web/src/features/<feature>.

## MVP shape

apps/web/src/features/<feature>/
api.ts
presenter.ts
view.tsx
<feature>.test.tsx

- api.ts calls the API client and maps the typed response.
- presenter.ts owns loading, error, and submit state.
- view.tsx renders accessible UI and delegates events to the presenter.
- Wire the route in apps/web/src/app/router.tsx.

Use React Hook Form + Zod only when the task is a form. Use Bahasa Indonesia copy for user-facing Axentra screens, and never replace a required API call with mock data or local-only state.

## Workflow

1. Read the task card, acceptance criteria, and any supplied Figma reference.
2. Inspect existing components, tokens, and API contracts before creating new ones.
3. Implement loading, empty, error, success, keyboard, and mobile states.
4. Add tests for each acceptance criterion and prove persistence against the API.
5. Run bun run complete-check before the PR.

## Checklist

- [ ] Route is reachable through React Router and has a useful document title.
- [ ] API errors are rendered without leaking server details.
- [ ] Primary actions are keyboard accessible and visibly disabled while pending.
- [ ] No foreign-project terminology or invented business scope remains.
