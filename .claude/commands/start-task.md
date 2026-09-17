---
name: Start Task Safely
description: Analyze an Axentra request, verify Git state, and define the task before implementation
---

# Start Task Safely

Use this workflow before implementing any developer request, especially when the request is vague,
contains only a task sentence, or includes a Figma URL/screenshot.

## 1. Understand the Request

1. Read `CLAUDE.md` and identify whether the request is a bug, feature, refactor, documentation,
   infrastructure, or review task.
2. Locate the matching approved user story, acceptance criteria, API spec, technical spec, and row in
   `docs/TASK_BREAKDOWN.md`.
3. For Frontend work with a Figma link or image, inspect the supplied design before coding. Record
   screens, responsive behavior, states, interactions, content, and API data the design requires.
4. For Backend work, trace the API contract, data model, authorization, storage/queue boundaries,
   audit requirements, and dependent Web behavior before proposing implementation.
5. If no approved card exists, produce a proposed card with scope, AC, dependencies, PIC, estimate,
   files, and verification plan. Do not silently invent an official Task ID or implement out-of-scope
   business behavior.

## 2. Verify Git State Before Coding

Run read-only checks first:

```powershell
git status --short --branch
git branch --show-current
git log -1 --oneline --decorate
git remote -v
```

Then:

1. Confirm the current branch matches the task. Implementation must not happen directly on `dev`
   or `main`.
2. If an `origin` remote and upstream exist, fetch/prune and compare the branch with its upstream and
   `origin/dev`. If there is no remote, no commit, or no upstream, state that freshness cannot be
   verified; never claim the branch is current.
3. If the developer forgot to switch branches and the worktree is clean, create/switch to the
   correctly named task branch. If the worktree is dirty, do not switch, stash, reset, or discard;
   report the files and ask for direction.
4. If the branch is behind or diverged, stop and report the exact relationship. Do not silently merge,
   rebase, or resolve conflicts.

## 3. Branch Naming

Use the card ID exactly, followed by a short imperative kebab-case title:

```text
BE-S1-01-Implement-auth-prerequisite
FE-S2-05-Build-related-documents-section
DB-S1-01-Create-document-core-schema
FND-07-Add-quality-gates
QA-S1-01-Verify-upload-duplicate-flow
```

The branch must start with the exact Card ID (`BE`, `FE`, `DB`, or `QA` plus sprint, or `FND` for a
Foundation card). Use ASCII letters, numbers, and hyphens only. Do not use `feature/`, `fix/`, or
arbitrary branch prefixes unless the repository owner explicitly adopts that convention.

## 4. Analysis Handoff

Before writing implementation code, report:

- Current branch, remote/upstream freshness, and any dirty files.
- Task ID, layer, PIC, User Story, AC, and intended branch name.
- Relevant design/API/data dependencies and affected flow.
- Planned files and tests.
- Risks, open decisions, and whether implementation is blocked.

Proceed only when the request is scoped and the Git state is safe. Use
`.claude/commands/commit-and-push.md` for the later commit/push gate.
