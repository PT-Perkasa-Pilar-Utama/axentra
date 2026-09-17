---
name: git-commit
description: Create a scoped Axentra commit only after verification, staged-diff review, and the project safety gate
---

# Skill: git-commit

## When to Use

Use only after a developer explicitly asks to commit, the assigned Axentra task is complete, and
the relevant verification is ready to run. For a push request, also read
`.claude/commands/commit-and-push.md` and complete its pre-push gate.

## Required Pre-Commit Checks

1. Read `CLAUDE.md`, the assigned task card, and the linked documentation.
2. Inspect the worktree and focused changes:

   ```powershell
   git status --short
   git diff --stat
   git diff --check
   ```

3. Stop if changes are outside the requested scope, belong to another developer, or cannot be
   explained. Never stage every file blindly.
4. Confirm the current branch is not `dev` or `main`.
5. Stage only the intended files with explicit paths, then inspect the exact staged diff:

   ```powershell
   git add apps/api/src/modules/documents
   git add docs/api-specs/03-documents.md
   git diff --cached --stat
   git diff --cached --check
   git diff --cached
   ```

6. Ensure no `.env`, `*.pem`, credentials, document contents, object keys, signed URLs, build
   output, or unrelated lockfile changes are staged.
7. Run the relevant gate:
   - Code, configuration, schema, or infrastructure: `bun run complete-check`.
   - Documentation-only change: `bun run fmt`.
   - Changed infrastructure boundary: also run `bun run test:integration` when available.
8. For a migration, ensure it was generated after rebasing on the target branch and reviewed under
   `packages/db/drizzle/`.

## Commit Message

Use Conventional Commits:

```text
<type>(<scope>): <subject>
```

Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.

Rules:

- Use imperative English and a concise subject.
- Use an Axentra scope such as `documents`, `auth`, `search`, `analytics`, `db`, `web`, `worker`,
  `ci`, or `docs`.
- Include the assigned task ID where applicable, for example `[BE-S1-02]`.
- Keep the first line to 80 characters or fewer.
- Do not add `Co-Authored-By` trailers.

Examples:

```text
feat(documents): add upload API [BE-S1-02]
fix(search): return empty state correctly [FE-S2-04]
docs(onboarding): clarify local setup
chore(ci): cache Bun install store
```

## Commit and Verify

```powershell
git commit -m "feat(documents): add upload API [BE-S1-02]"
git show --stat --oneline HEAD
```

Report the commit hash, message, branch, staged scope, and verification evidence. Do not push
unless the developer explicitly requested a push; if they did, continue with
`.claude/commands/commit-and-push.md`.

## Stop Conditions

- A verification command fails or is blocked.
- A migration is unreviewed or stale against the target branch.
- A sensitive file or data appears in the staged diff.
- The current branch is protected, the diff has unrelated work, or a conflict is present.
- A requested push is rejected or the remote branch has diverged.
