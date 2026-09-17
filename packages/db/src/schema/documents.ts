import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { categories } from "./categories";
import { processingStatusEnum } from "./enums";
import { documentSmartTags } from "./tags";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    processingStatus: processingStatusEnum("processing_status").default("queued").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("documents_processing_status_idx").on(table.processingStatus),
    index("documents_category_id_idx").on(table.categoryId),
    index("documents_created_at_idx").on(table.createdAt),
  ],
);

export const documentFiles = pgTable(
  "document_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    fileExtension: text("file_extension").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("document_files_document_id_idx").on(table.documentId),
    index("document_files_storage_key_idx").on(table.storageKey),
  ],
);

export const documentContentHashes = pgTable(
  "document_content_hashes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    hashAlgorithm: text("hash_algorithm").default("sha256").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_content_hashes_hash_algo_unique_idx").on(
      table.contentHash,
      table.hashAlgorithm,
    ),
    index("document_content_hashes_document_id_idx").on(table.documentId),
  ],
);

export const documentMetadata = pgTable(
  "document_metadata",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    author: text("author"),
    rawMetadata: jsonb("raw_metadata"),
    extractedAt: timestamp("extracted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_metadata_document_id_unique_idx").on(table.documentId),
    index("document_metadata_author_idx").on(table.author),
  ],
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  category: one(categories, {
    fields: [documents.categoryId],
    references: [categories.id],
  }),
  files: many(documentFiles),
  contentHashes: many(documentContentHashes),
  metadata: one(documentMetadata, {
    fields: [documents.id],
    references: [documentMetadata.documentId],
  }),
  documentTags: many(documentSmartTags),
}));

export const documentFilesRelations = relations(documentFiles, ({ one }) => ({
  document: one(documents, {
    fields: [documentFiles.documentId],
    references: [documents.id],
  }),
}));

export const documentContentHashesRelations = relations(documentContentHashes, ({ one }) => ({
  document: one(documents, {
    fields: [documentContentHashes.documentId],
    references: [documents.id],
  }),
}));

export const documentMetadataRelations = relations(documentMetadata, ({ one }) => ({
  document: one(documents, {
    fields: [documentMetadata.documentId],
    references: [documents.id],
  }),
}));
