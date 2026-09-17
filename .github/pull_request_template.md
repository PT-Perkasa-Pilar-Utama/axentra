## Task Reference

- Task ID: <!-- e.g. BE-S1-03 or FE-S2-05 -->
- PIC: <!-- Arya / Sami / Azis / Aiman -->
- User Story: <!-- e.g. US-01; use N/A only for Foundation work -->
- Sprint: <!-- Sprint 1 / 2 / 3 / 4, or Foundation -->
- AC covered: <!-- e.g. AC-01.01, AC-01.04 -->

## Target Branch

<!-- Normal task PRs target `dev`. Only Arya Isnaidi (Tech Lead) opens the `dev` -> `main` promotion PR. -->

- [ ] `dev` - integration and internal acceptance
- [ ] `main` - production release

## What Changed

<!-- High-level bullets: what was added, modified, or removed. -->

-
-

## Why

<!-- State the business or technical reason. Link the relevant Axentra docs when useful. -->

## How to Test

<!-- Give reproducible steps. Include test role, sample data, expected result, and command output when relevant. -->

1.
2.

## Impact

- Migration impact: <!-- None, or migration name and forward-fix/rollback notes -->
- Environment/config impact: <!-- None, or required variables/infrastructure -->
- Security and authorization impact: <!-- None, or server-side controls changed -->
- Documentation updated: <!-- List docs, or N/A with reason -->

## Acceptance Evidence

<!-- Required for AC-linked work. Record environment, role/test account, expected result, and observed result. -->

| AC  | Environment | Role / test account | Expected result | Observed result |
| --- | ----------- | ------------------- | --------------- | --------------- |
|     |             |                     |                 |                 |

## Screenshots (Frontend Changes)

<!-- Add before/after screenshots or a short recording for visible UI changes. Delete this section if not applicable. -->

---

## Pre-PR Checklist

- [ ] Scope matches the assigned card and linked business, API, and technical docs.
- [ ] I have self-reviewed against [`docs/CODE_REVIEW_CHECKLIST.md`](../blob/main/docs/CODE_REVIEW_CHECKLIST.md).
- [ ] `bun run complete-check` passes locally, or I have recorded the blocked check and reason above.
- [ ] The task is ready for review on the internal board, where a board is used.
- [ ] No `.env`, `*.pem`, credentials, document contents, object keys, or signed URLs are committed or logged.
- [ ] Migration files, if any, were generated after rebasing on the target branch and reviewed.
- [ ] Relevant tests, configuration, docs, and acceptance evidence are updated.
- [ ] UI work considers loading, empty, error, retry, denied, and success states.
- [ ] No unrelated refactor or unapproved sprint scope is included.

## Tech Lead Review

<!-- Arya Isnaidi (Tech Lead) completes this section. -->

- [ ] Approved
- [ ] Changes requested
