import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
