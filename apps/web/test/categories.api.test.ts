import { afterEach, describe, expect, test } from "bun:test";
import { listCategories } from "../src/features/categories/categories.api";
import { ApiClientError } from "../src/lib/api-client";

const validCategory = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Reporting",
  slug: "reporting",
  downloadEnabled: false,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

describe("categories API", () => {
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
        });
      },
      { preconnect: (): void => {} },
    );

    const result = await listCategories();

    const url = new URL(requestUrl, "http://localhost");
    expect(url.pathname).toBe("/api/v1/categories");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(result).toEqual([validCategory]);
  });

  test("rejects malformed category payloads", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ success: true, data: [{ ...validCategory, id: "bad" }] }), {
          status: 200,
        }),
      { preconnect: (): void => {} },
    );

    await expect(listCategories()).rejects.toBeInstanceOf(ApiClientError);
  });
});
