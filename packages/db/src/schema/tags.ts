import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { documents } from "./documents";

export const smartTags = pgTable(
  "smart_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("smart_tags_name_unique_idx").on(table.name)],
);

export const documentSmartTags = pgTable(
  "document_smart_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => smartTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_smart_tags_unique_idx").on(table.documentId, table.tagId),
    index("document_smart_tags_document_id_idx").on(table.documentId),
    index("document_smart_tags_tag_id_idx").on(table.tagId),
  ],
);

export const smartTagsRelations = relations(smartTags, ({ many }) => ({
  documentTags: many(documentSmartTags),
}));

export const documentSmartTagsRelations = relations(documentSmartTags, ({ one }) => ({
  document: one(documents, {
    fields: [documentSmartTags.documentId],
    references: [documents.id],
  }),
  tag: one(smartTags, {
    fields: [documentSmartTags.tagId],
    references: [smartTags.id],
  }),
}));
