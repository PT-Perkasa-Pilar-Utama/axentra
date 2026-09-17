---
name: developer-pre-pr-checklist
description: Verify Axentra changes before opening a pull request.
---

# Axentra pre-PR checklist

The Tech Lead (Arya Isnaidi) is the final reviewer. Normal work targets dev; main is release-only.

## Required checks

Run from the repository root:
bun run complete-check

This runs formatting, lint, type-check, tests, and builds for the web, API, and worker. For database changes, also run the disposable Postgres migration check described in docs/CODING_STANDARD.md.

## Self-review

- [ ] Task ID and acceptance criteria are in the PR.
- [ ] Diff is scoped; no generated build output, env files, keys, or credentials are committed.
- [ ] API authorization, tenant/branch context, and error envelopes are server-enforced.
- [ ] UI states and persistence are tested, not simulated with static data.
- [ ] Migration protocol was followed, if applicable.
- [ ] docs/TASK_BREAKDOWN.md card is In Review.
- [ ] CI checks are green before requesting review.

Push only the feature branch. Open a PR into dev; never push directly to protected dev or main.
