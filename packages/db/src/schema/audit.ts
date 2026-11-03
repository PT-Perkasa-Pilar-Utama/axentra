import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { categories } from "./categories";
import { documents } from "./documents";
import { users } from "./users";

export const downloadAuditEvents = pgTable(
  "download_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    userEmail: text("user_email"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    documentName: text("document_name").notNull(),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("download_audit_events_user_id_idx").on(table.userId),
    index("download_audit_events_document_id_idx").on(table.documentId),
    index("download_audit_events_downloaded_at_idx").on(table.downloadedAt),
  ],
);

export const downloadAuditEventsRelations = relations(downloadAuditEvents, ({ one }) => ({
  user: one(users, {
    fields: [downloadAuditEvents.userId],
    references: [users.id],
  }),
  document: one(documents, {
    fields: [downloadAuditEvents.documentId],
    references: [documents.id],
  }),
}));

export const categoryPermissionAuditEvents = pgTable(
  "category_permission_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    categoryName: text("category_name").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    userEmail: text("user_email"),
    previousDownloadEnabled: boolean("previous_download_enabled"),
    newDownloadEnabled: boolean("new_download_enabled").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("category_permission_audit_events_category_id_idx").on(table.categoryId),
    index("category_permission_audit_events_user_id_idx").on(table.userId),
    index("category_permission_audit_events_changed_at_idx").on(table.changedAt),
  ],
);

export const categoryPermissionAuditEventsRelations = relations(
  categoryPermissionAuditEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [categoryPermissionAuditEvents.userId],
      references: [users.id],
    }),
    category: one(categories, {
      fields: [categoryPermissionAuditEvents.categoryId],
      references: [categories.id],
    }),
  }),
);
