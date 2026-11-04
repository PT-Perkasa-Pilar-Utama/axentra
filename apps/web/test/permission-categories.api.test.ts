import { afterEach, describe, expect, test } from "bun:test";
import {
  PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  PERMISSION_CATEGORIES_MAX_LIMIT,
} from "@axentra/shared";
import {
  PERMISSION_CATEGORIES_MIN_LIMIT,
  listPermissionCategories,
  updatePermissionCategory,
} from "../src/features/permission-categories/permission-categories.api";
import { ApiClientError } from "../src/lib/api-client";

const validCategory = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Reporting",
  slug: "reporting",
  downloadEnabled: false,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

describe("permissionCategories API", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("requests a bounded category list and parses its response", async () => {
    let requestUrl = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        requestUrl = String(input);
        return new Response(JSON.stringify({ success: true, data: [validCategory] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      { preconnect: (): void => {} },
    );

    const result = await listPermissionCategories();

    const url = new URL(requestUrl, "http://localhost");
    expect(url.pathname).toBe("/api/v1/permission-categories");
    expect(url.searchParams.get("limit")).toBe(String(PERMISSION_CATEGORIES_DEFAULT_LIMIT));
    expect(result).toEqual([validCategory]);
  });

  test("clamps query limit parameter to valid bounds [1, 100]", async () => {
    let requestedLimit = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = new URL(String(input), "http://localhost");
        requestedLimit = url.searchParams.get("limit") ?? "";
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      { preconnect: (): void => {} },
    );

    await listPermissionCategories(0);
    expect(requestedLimit).toBe(String(PERMISSION_CATEGORIES_MIN_LIMIT));

    await listPermissionCategories(PERMISSION_CATEGORIES_MAX_LIMIT + 100);
    expect(requestedLimit).toBe(String(PERMISSION_CATEGORIES_MAX_LIMIT));
  });

  test("sends PATCH request with downloadEnabled boolean payload", async () => {
    let requestMethod = "";
    let requestUrl = "";
    let requestBody = "";

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requestUrl = String(input);
        requestMethod = init?.method ?? "GET";
        requestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            success: true,
            data: { ...validCategory, downloadEnabled: true },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
      { preconnect: (): void => {} },
    );

    const updated = await updatePermissionCategory(validCategory.id, true);

    expect(requestMethod).toBe("PATCH");
    expect(requestUrl).toContain(`/api/v1/permission-categories/${validCategory.id}`);
    expect(JSON.parse(requestBody)).toEqual({ downloadEnabled: true });
    expect(updated.downloadEnabled).toBe(true);
  });

  test("rejects malformed category list payloads", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({ success: true, data: [{ ...validCategory, id: "bad-id" }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      { preconnect: (): void => {} },
    );

    await expect(listPermissionCategories()).rejects.toBeInstanceOf(ApiClientError);
  });

  test("rejects malformed category update payloads", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            success: true,
            data: { ...validCategory, downloadEnabled: "not-a-boolean" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      { preconnect: (): void => {} },
    );

    await expect(updatePermissionCategory(validCategory.id, true)).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});
