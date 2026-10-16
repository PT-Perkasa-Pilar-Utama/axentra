import { describe, expect, it } from "bun:test";
import {
  ensureCategoryWithPermission,
  listAvailableCategories,
  type CategoryPersistenceOperations,
  type CategoryQueryOperations,
} from "./category.persistence";

describe("category.persistence (Findings F27, F28)", () => {
  describe("listAvailableCategories", () => {
    it("returns list of categories from query operations", async () => {
      const mockCategories = [
        { name: "Reporting", slug: "reporting" },
        { name: "Contract", slug: "contract" },
      ];

      const queryOps: CategoryQueryOperations = {
        async listCategories() {
          return mockCategories;
        },
      };

      const result = await listAvailableCategories(queryOps);
      expect(result).toEqual(mockCategories);
    });
  });

  describe("ensureCategoryWithPermission", () => {
    it("returns existing category without inserting new category (isNew: false)", async () => {
      const existingId = "cat-existing-123";
      const permissionsInserted: Array<{ categoryId: string; now: Date }> = [];
      let insertCalled = false;

      const persistenceOps: CategoryPersistenceOperations = {
        async findCategoryBySlugOrName(slug: string, name: string) {
          if (slug === "reporting" && name === "Reporting") {
            return { id: existingId };
          }
          return null;
        },
        async insertCategory(_name: string, _slug: string, _now: Date) {
          insertCalled = true;
          return null;
        },
        async ensureCategoryPermission(categoryId: string, now: Date) {
          permissionsInserted.push({ categoryId, now });
        },
      };

      const testNow = new Date("2026-10-14T10:00:00.000Z");
      const result = await ensureCategoryWithPermission(
        persistenceOps,
        { name: "Reporting", slug: "reporting" },
        testNow,
      );

      expect(result).toEqual({
        categoryId: existingId,
        isNew: false,
      });
      expect(insertCalled).toBe(false);
      expect(permissionsInserted).toHaveLength(1);
      expect(permissionsInserted[0]).toEqual({
        categoryId: existingId,
        now: testNow,
      });
    });

    it("inserts new category when not found and returns isNew: true", async () => {
      const newCatId = "cat-new-456";
      let insertedParams: { name: string; slug: string; now: Date } | undefined;
      const permissionsInserted: Array<{ categoryId: string; now: Date }> = [];

      const persistenceOps: CategoryPersistenceOperations = {
        async findCategoryBySlugOrName(_slug: string, _name: string) {
          return null;
        },
        async insertCategory(name: string, slug: string, now: Date) {
          insertedParams = { name, slug, now };
          return { id: newCatId };
        },
        async ensureCategoryPermission(categoryId: string, now: Date) {
          permissionsInserted.push({ categoryId, now });
        },
      };

      const testNow = new Date("2026-10-14T10:00:00.000Z");
      const result = await ensureCategoryWithPermission(
        persistenceOps,
        { name: "New Category", slug: "new-category" },
        testNow,
      );

      expect(result).toEqual({
        categoryId: newCatId,
        isNew: true,
      });
      expect(insertedParams).toEqual({
        name: "New Category",
        slug: "new-category",
        now: testNow,
      });
      expect(permissionsInserted).toHaveLength(1);
      expect(permissionsInserted[0]).toEqual({
        categoryId: newCatId,
        now: testNow,
      });
    });

    it("falls back to canonical category if concurrent insert conflicts", async () => {
      const canonicalId = "cat-canonical-789";
      let selectCount = 0;
      const permissionsInserted: Array<{ categoryId: string; now: Date }> = [];

      const persistenceOps: CategoryPersistenceOperations = {
        async findCategoryBySlugOrName(_slug: string, _name: string) {
          selectCount++;
          // First lookup returns null (not found), second lookup after conflict returns canonical
          return selectCount === 1 ? null : { id: canonicalId };
        },
        async insertCategory(_name: string, _slug: string, _now: Date) {
          // Simulated unique constraint conflict (returns null due to onConflictDoNothing)
          return null;
        },
        async ensureCategoryPermission(categoryId: string, now: Date) {
          permissionsInserted.push({ categoryId, now });
        },
      };

      const testNow = new Date("2026-10-14T10:00:00.000Z");
      const result = await ensureCategoryWithPermission(
        persistenceOps,
        { name: "Concurrent Category", slug: "concurrent-category" },
        testNow,
      );

      expect(result).toEqual({
        categoryId: canonicalId,
        isNew: false,
      });
      expect(selectCount).toBe(2);
      expect(permissionsInserted).toHaveLength(1);
      expect(permissionsInserted[0]).toEqual({
        categoryId: canonicalId,
        now: testNow,
      });
    });

    it("returns null if category cannot be found or inserted", async () => {
      const persistenceOps: CategoryPersistenceOperations = {
        async findCategoryBySlugOrName(_slug: string, _name: string) {
          return null;
        },
        async insertCategory(_name: string, _slug: string, _now: Date) {
          return null;
        },
        async ensureCategoryPermission(_categoryId: string, _now: Date) {
          throw new Error("Should not be called if categoryId is unresolved");
        },
      };

      const result = await ensureCategoryWithPermission(
        persistenceOps,
        { name: "Missing Category", slug: "missing-category" },
        new Date(),
      );

      expect(result).toBeNull();
    });
  });
});
