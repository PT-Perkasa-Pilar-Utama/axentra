import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("categories_name_unique_idx").on(table.name),
    uniqueIndex("categories_slug_unique_idx").on(table.slug),
  ],
);

export const categoryDownloadPermissions = pgTable(
  "category_download_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    downloadEnabled: boolean("download_enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("category_download_permissions_category_id_unique_idx").on(table.categoryId),
  ],
);

export const categoriesRelations = relations(categories, ({ one }) => ({
  downloadPermission: one(categoryDownloadPermissions, {
    fields: [categories.id],
    references: [categoryDownloadPermissions.categoryId],
  }),
}));

export const categoryDownloadPermissionsRelations = relations(
  categoryDownloadPermissions,
  ({ one }) => ({
    category: one(categories, {
      fields: [categoryDownloadPermissions.categoryId],
      references: [categories.id],
    }),
  }),
);
