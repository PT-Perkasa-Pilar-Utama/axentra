---
name: add-drizzle-migration
description: Safely change the Axentra PostgreSQL schema with Drizzle.
---

# Add an Axentra Drizzle migration

Use for an approved task that changes packages/db/src/schema. Foundation v1.0.0 intentionally has no business tables; do not add domain tables without an approved card and acceptance criteria.

## Protocol

1. Start from the latest integration branch: git checkout dev and git pull --ff-only origin dev.
2. Edit the schema in packages/db/src/schema and update its exports.
3. Run bun run db:generate exactly once in the PR.
4. Review generated SQL in packages/db/drizzle; never hand-edit generated migrations.
5. Run bun run db:migrate against a disposable local database and add repository/service tests.
6. If another PR generated a migration after your branch point, rebase on origin/dev, remove only your own obsolete generated migration, regenerate once, and rerun checks.
7. Run bun run complete-check.

## Rules

- Every table needs an explicit primary key, timestamps, and indexes required by its access patterns.
- Encode uniqueness and foreign keys in the database, not only in application code.
- Keep secrets and document content out of logs and migration comments.
- Do not run migrations against production from a developer laptop.
