---
name: Commit and Push Safely
description: Commit and push Axentra changes only after preflight, verification, and remote-divergence checks
---

# Commit and Push Safely

Use this workflow whenever a developer explicitly asks an AI to commit or push. A request to commit
authorizes a local commit only. A request to push authorizes a normal, non-force push only.

## Pre-Commit Gate

1. Inspect `git status --short`, `git diff --stat`, and the focused diff. Stop if unrelated or
   unexplained changes would be included; never silently stage another developer's work.
2. Confirm the current branch is not `dev` or `main`. Direct commits and pushes to protected
   branches are prohibited.
3. Read the assigned task card and linked docs. Ensure the diff stays within scope.
4. Stage only intended paths with explicit `git add <path>` commands. Never use `git add -A` or
   `git add .` blindly.
5. Inspect `git diff --cached --stat`, `git diff --cached --check`, and the staged diff.
6. Ensure no `.env`, `*.pem`, credential, document content, signed URL, or object key is staged.
7. Run the applicable verification:
   - Code, configuration, schema, or infrastructure changes: `bun run complete-check`.
   - Documentation-only changes: `bun run fmt`.
   - Changed infrastructure boundaries: also run `bun run test:integration` when local services are
     available.
8. For migrations, confirm the generated files are intentional, current against the target branch,
   and follow `docs/CODING_STANDARD.md`.
9. Create one Conventional Commit with the relevant Task ID. Do not add `Co-Authored-By` trailers.
10. Verify the created commit with `git show --stat --oneline HEAD`.

## Pre-Push Gate

1. Confirm an `origin` remote and a correctly named task branch exist. If either is missing, stop
   and report the required setup; do not invent a remote URL.
2. Fetch without modifying the worktree:

   ```powershell
   git fetch --prune origin
   ```

3. Compare the branch with its upstream, or with the intended base branch (`origin/dev` for normal
   task work). If the branch is behind or the target branch has advanced, stop and report that a
   rebase/merge decision is required. Do not rebase, merge, or resolve conflicts without explicit
   instruction.
4. Re-run the appropriate verification if code changed since the pre-commit gate.
5. Push with a normal push only:

   ```powershell
   git push -u origin HEAD
   ```

6. If Git rejects the push, stop. Inspect the rejection and report the divergence or permission
   issue. Never use `--force`, `--force-with-lease`, or direct pushes to protected branches unless
   Arya Isnaidi explicitly authorizes a specific recovery operation.

## Stop Conditions

Stop and ask for direction when any of these occur:

- Merge/rebase conflict or remote divergence.
- Unrelated working-tree changes or an uncertain file owner.
- Failed check, blocked integration dependency, or unreviewed migration.
- Suspected secret/sensitive document data in the staged diff.
- Missing remote, missing upstream, protected-branch target, or rejected push.

## Completion Report

Report the commit hash, commit message, branch, verification evidence, and push result. Clearly mark
any blocked check or unresolved conflict.
