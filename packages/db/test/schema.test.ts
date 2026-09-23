import { describe, expect, it } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  categories,
  categoryDownloadPermissions,
  documentContentHashes,
  documentFiles,
  documentMetadata,
  documentSmartTags,
  documents,
  processingStatusEnum,
  smartTags,
} from "../src/schema";

describe("database schema definitions", () => {
  it("defines processing status enum values", () => {
    expect(processingStatusEnum.enumValues).toEqual([
      "queued",
      "processing",
      "completed",
      "failed",
    ]);
  });

  it("defines categories table columns", () => {
    const cols = getTableColumns(categories);
    expect(cols.id).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.slug).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it("defines category_download_permissions table with default disabled", () => {
    const cols = getTableColumns(categoryDownloadPermissions);
    expect(cols.id).toBeDefined();
    expect(cols.categoryId).toBeDefined();
    expect(cols.downloadEnabled).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it("defines documents table columns and default status", () => {
    const cols = getTableColumns(documents);
    expect(cols.id).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.categoryId).toBeDefined();
    expect(cols.processingStatus).toBeDefined();
    expect(cols.errorMessage).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
    expect(cols.deletedAt).toBeDefined();
  });

  it("defines document_files table columns and unique document_id constraint", () => {
    const cols = getTableColumns(documentFiles);
    expect(cols.id).toBeDefined();
    expect(cols.documentId).toBeDefined();
    expect(cols.storageKey).toBeDefined();
    expect(cols.originalName).toBeDefined();
    expect(cols.mimeType).toBeDefined();
    expect(cols.fileSize).toBeDefined();
    expect(cols.fileExtension).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();

    const config = getTableConfig(documentFiles);
    const docIdIndex = config.indexes.find(
      (idx) => idx.config.name === "document_files_document_id_unique_idx",
    );
    expect(docIdIndex).toBeDefined();
    expect(docIdIndex?.config.unique).toBe(true);
  });

  it("defines document_content_hashes table columns", () => {
    const cols = getTableColumns(documentContentHashes);
    expect(cols.id).toBeDefined();
    expect(cols.documentId).toBeDefined();
    expect(cols.hashAlgorithm).toBeDefined();
    expect(cols.contentHash).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("defines document_metadata table columns", () => {
    const cols = getTableColumns(documentMetadata);
    expect(cols.id).toBeDefined();
    expect(cols.documentId).toBeDefined();
    expect(cols.author).toBeDefined();
    expect(cols.rawMetadata).toBeDefined();
    expect(cols.extractedAt).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it("defines smart_tags and document_smart_tags table columns", () => {
    const tagCols = getTableColumns(smartTags);
    expect(tagCols.id).toBeDefined();
    expect(tagCols.name).toBeDefined();
    expect(tagCols.createdAt).toBeDefined();

    const docTagCols = getTableColumns(documentSmartTags);
    expect(docTagCols.id).toBeDefined();
    expect(docTagCols.documentId).toBeDefined();
    expect(docTagCols.tagId).toBeDefined();
    expect(docTagCols.createdAt).toBeDefined();
  });
});
