import { describe, expect, it } from "bun:test";
import { ensureCategoryWithPermission, listAvailableCategories } from "./category.persistence";
import type { DatabaseTransaction } from "./category.persistence";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { categories, categoryDownloadPermissions } from "@axentra/db";

describe("category.persistence (Finding F27)", () => {
  describe("listAvailableCategories", () => {
    it("returns list of categories from database", async () => {
      const mockCategories = [
        { name: "Reporting", slug: "reporting" },
        { name: "Contract", slug: "contract" },
      ];

      const mockDb = {
        select: (_fields: unknown) => ({
          from: (_table: unknown) => Promise.resolve(mockCategories),
        }),
      } as unknown as PostgresJsDatabase;

      const result = await listAvailableCategories(mockDb);
      expect(result).toEqual(mockCategories);
    });
  });

  describe("ensureCategoryWithPermission", () => {
    it("returns existing category without inserting new category (isNew: false)", async () => {
      const existingId = "cat-existing-123";
      const permissionInserted: Array<{ categoryId: string; downloadEnabled: boolean }> = [];

      const mockTx = {
        select: (_fields: unknown) => ({
          from: (_table: unknown) => ({
            where: (_cond: unknown) => ({
              limit: async (_limit: number) => [{ id: existingId }],
            }),
          }),
        }),
        insert: (table: unknown) => ({
          values: (vals: { categoryId: string; downloadEnabled: boolean }) => {
            if (table === categoryDownloadPermissions) {
              permissionInserted.push(vals);
            }
            return {
              onConflictDoNothing: () => Promise.resolve(),
            };
          },
        }),
      } as unknown as DatabaseTransaction;

      const result = await ensureCategoryWithPermission(
        mockTx,
        { name: "Reporting", slug: "reporting" },
        new Date(),
      );

      expect(result).not.toBeNull();
      expect(result?.categoryId).toBe(existingId);
      expect(result?.isNew).toBe(false);
      expect(permissionInserted).toHaveLength(1);
      expect(permissionInserted[0]?.categoryId).toBe(existingId);
      expect(permissionInserted[0]?.downloadEnabled).toBe(false);
    });

    it("inserts new category when not found and returns isNew: true", async () => {
      const newCatId = "cat-new-456";
      let categoryInserted = false;
      const permissionInserted: Array<{ categoryId: string; downloadEnabled: boolean }> = [];

      const mockTx = {
        select: (_fields: unknown) => ({
          from: (_table: unknown) => ({
            where: (_cond: unknown) => ({
              limit: async (_limit: number) => [],
            }),
          }),
        }),
        insert: (table: unknown) => ({
          values: (vals: unknown) => {
            if (table === categories) {
              categoryInserted = true;
              return {
                onConflictDoNothing: () => ({
                  returning: async () => [{ id: newCatId }],
                }),
              };
            }
            if (table === categoryDownloadPermissions) {
              permissionInserted.push(vals as { categoryId: string; downloadEnabled: boolean });
              return {
                onConflictDoNothing: () => Promise.resolve(),
              };
            }
            return {
              onConflictDoNothing: () => Promise.resolve(),
            };
          },
        }),
      } as unknown as DatabaseTransaction;

      const result = await ensureCategoryWithPermission(
        mockTx,
        { name: "New Category", slug: "new-category" },
        new Date(),
      );

      expect(result).not.toBeNull();
      expect(result?.categoryId).toBe(newCatId);
      expect(result?.isNew).toBe(true);
      expect(categoryInserted).toBe(true);
      expect(permissionInserted).toHaveLength(1);
      expect(permissionInserted[0]?.categoryId).toBe(newCatId);
      expect(permissionInserted[0]?.downloadEnabled).toBe(false);
    });

    it("falls back to canonical category if concurrent insert conflicts", async () => {
      const canonicalId = "cat-canonical-789";
      let selectCount = 0;

      const mockTx = {
        select: (_fields: unknown) => ({
          from: (_table: unknown) => ({
            where: (_cond: unknown) => ({
              limit: async (_limit: number) => {
                selectCount++;
                // First select returns empty (not found), second select returns canonical
                return selectCount === 1 ? [] : [{ id: canonicalId }];
              },
            }),
          }),
        }),
        insert: (table: unknown) => ({
          values: (_vals: unknown) => {
            if (table === categories) {
              return {
                onConflictDoNothing: () => ({
                  returning: async () => [], // simulated conflict: returns empty
                }),
              };
            }
            return {
              onConflictDoNothing: () => Promise.resolve(),
            };
          },
        }),
      } as unknown as DatabaseTransaction;

      const result = await ensureCategoryWithPermission(
        mockTx,
        { name: "Concurrent Category", slug: "concurrent-category" },
        new Date(),
      );

      expect(result).not.toBeNull();
      expect(result?.categoryId).toBe(canonicalId);
      expect(result?.isNew).toBe(false);
    });
  });
});
