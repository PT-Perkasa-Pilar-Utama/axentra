import { describe, expect, it } from "bun:test";
import { getTableColumns, getTableName } from "drizzle-orm";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { documentProcessingStatusSchema, processingStatusSchema } from "@axentra/shared";
import {
  categories,
  categoryDownloadPermissions,
  categoryDownloadPermissionsRelations,
  categoriesRelations,
  documentContentHashes,
  documentFiles,
  documents,
  processingStatusEnum,
} from "./index";

// Covers the DB-S1-01 Round 5 F9 constraints: fileSize validation, mandatory content hash,
// processing status enum integration, and the category download permission relation.
describe("document core schema constraints (DB-S1-01 F9)", () => {
  it("rejects negative file sizes with a CHECK constraint on document_files", () => {
    const check = getTableConfig(documentFiles).checks.find(
      (candidate) => candidate.name === "document_files_file_size_non_negative_check",
    );

    expect(check).toBeDefined();
    const rendered = check ? new PgDialect().sqlToQuery(check.value).sql : "";
    expect(rendered).toMatch(/file_size"?\s*>=\s*0$/);
  });

  it("requires file_size and content_hash to be present", () => {
    expect(getTableColumns(documentFiles).fileSize.notNull).toBe(true);
    expect(getTableColumns(documentContentHashes).contentHash.notNull).toBe(true);
    expect(getTableColumns(documentContentHashes).hashAlgorithm.hasDefault).toBe(true);
  });

  it("keeps the processing status enum identical to the shared status contracts", () => {
    const databaseStatuses: string[] = [...processingStatusEnum.enumValues];
    const sharedStatuses: string[] = [...processingStatusSchema.options];
    const documentStatuses: string[] = [...documentProcessingStatusSchema.options];

    expect(databaseStatuses).toEqual(sharedStatuses);
    expect(documentStatuses).toEqual(sharedStatuses);
    expect(databaseStatuses).not.toContain("processed");
  });

  it("links documents to categories with SET NULL and category permissions with CASCADE", () => {
    const documentForeignKey = getTableConfig(documents).foreignKeys.find(
      (fk) => getTableName(fk.reference().foreignTable) === getTableName(categories),
    );
    const permissionForeignKey = getTableConfig(categoryDownloadPermissions).foreignKeys.find(
      (fk) => getTableName(fk.reference().foreignTable) === getTableName(categories),
    );

    expect(documentForeignKey?.onDelete).toBe("set null");
    expect(permissionForeignKey?.onDelete).toBe("cascade");
    expect(categoriesRelations).toBeDefined();
    expect(categoryDownloadPermissionsRelations).toBeDefined();
  });
});
