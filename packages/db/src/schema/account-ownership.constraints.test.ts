import { describe, expect, it } from "bun:test";
import { getTableColumns, getTableName } from "drizzle-orm";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { documents, users } from "./index";

// Covers DB-S4-01: account status, document uploader ownership, and the archive timestamp.
describe("account status and document ownership schema (DB-S4-01)", () => {
  it("requires users.status and gives it a default", () => {
    const status = getTableColumns(users).status;

    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
  });

  it("limits users.status to active or inactive with a CHECK constraint", () => {
    const check = getTableConfig(users).checks.find(
      (candidate) => candidate.name === "users_status_check",
    );

    expect(check).toBeDefined();
    const rendered = check ? new PgDialect().sqlToQuery(check.value).sql : "";
    expect(rendered).toMatch(/in \('active', 'inactive'\)$/);
  });

  it("keeps the CHECK values identical to the users.status enum options", () => {
    const check = getTableConfig(users).checks.find(
      (candidate) => candidate.name === "users_status_check",
    );
    const rendered = check ? new PgDialect().sqlToQuery(check.value).sql : "";
    const checkValues = Array.from(rendered.matchAll(/'([^']+)'/g), (match) => match[1]);

    expect(checkValues).toEqual([...getTableColumns(users).status.enumValues]);
  });

  it("links documents.uploaded_by to users with SET NULL and keeps it nullable", () => {
    const uploaderForeignKey = getTableConfig(documents).foreignKeys.find(
      (fk) => getTableName(fk.reference().foreignTable) === getTableName(users),
    );

    expect(uploaderForeignKey?.onDelete).toBe("set null");
    expect(getTableColumns(documents).uploadedBy.notNull).toBe(false);
  });

  it("keeps documents.archived_at nullable and indexes documents.uploaded_by", () => {
    const indexNames = getTableConfig(documents).indexes.map((index) => index.config.name);

    expect(getTableColumns(documents).archivedAt.notNull).toBe(false);
    expect(indexNames).toContain("documents_uploaded_by_idx");
  });
});
