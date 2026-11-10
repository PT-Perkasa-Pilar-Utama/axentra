import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
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

// Point-in-time record of an Admin changing a Member Team or Head of Team account status (BE-S4-06).
export const accountStatusAuditEvents = pgTable(
  "account_status_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    userEmail: text("user_email"),
    previousStatus: text("previous_status", { enum: ["active", "inactive"] }).notNull(),
    newStatus: text("new_status", { enum: ["active", "inactive"] }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    changedAt: timestamp("changed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "account_status_audit_events_previous_status_check",
      sql`${table.previousStatus} in ('active', 'inactive')`,
    ),
    check(
      "account_status_audit_events_new_status_check",
      sql`${table.newStatus} in ('active', 'inactive')`,
    ),
    index("account_status_audit_events_user_id_idx").on(table.userId),
    index("account_status_audit_events_actor_user_id_idx").on(table.actorUserId),
    index("account_status_audit_events_changed_at_idx").on(table.changedAt),
  ],
);

// Point-in-time record of an Admin archiving, unarchiving, or soft-deleting a document (BE-S4-07).
export const adminDocumentAuditEvents = pgTable(
  "admin_document_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    documentTitle: text("document_title").notNull(),
    action: text("action", { enum: ["archive", "unarchive", "delete"] }).notNull(),
    previousArchivedAt: timestamp("previous_archived_at", { withTimezone: true, mode: "date" }),
    newArchivedAt: timestamp("new_archived_at", { withTimezone: true, mode: "date" }),
    previousDeletedAt: timestamp("previous_deleted_at", { withTimezone: true, mode: "date" }),
    newDeletedAt: timestamp("new_deleted_at", { withTimezone: true, mode: "date" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    changedAt: timestamp("changed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "admin_document_audit_events_action_check",
      sql`${table.action} in ('archive', 'unarchive', 'delete')`,
    ),
    index("admin_document_audit_events_document_id_idx").on(table.documentId),
    index("admin_document_audit_events_actor_user_id_idx").on(table.actorUserId),
    index("admin_document_audit_events_changed_at_idx").on(table.changedAt),
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
