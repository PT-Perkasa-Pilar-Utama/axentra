import { afterEach, describe, expect, test } from "bun:test";
import {
  ADMIN_USERS_DEFAULT_LIMIT,
  ADMIN_USERS_DEFAULT_PAGE,
  ADMIN_USERS_MAX_LIMIT,
  ADMIN_USERS_MIN_LIMIT,
  listAdminUsers,
  updateAdminUserStatus,
  type AdminUser,
} from "../src/features/admin-users/admin-users.api";
import { ApiClientError } from "../src/lib/api-client";

const sampleUser: AdminUser = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Budi Santoso",
  email: "budi.santoso@perkasa.example",
  role: "member_team",
  status: "active",
};

describe("adminUsers API", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("calls GET /admin/users with default pagination and parses response", async () => {
    let requestedUrl = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({
            success: true,
            data: [sampleUser],
            meta: { page: 1, limit: 20, total: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
      { preconnect: (): void => {} },
    );

    const result = await listAdminUsers();

    const url = new URL(requestedUrl, "http://localhost");
    expect(url.pathname).toBe("/api/v1/admin/users");
    expect(url.searchParams.get("page")).toBe(String(ADMIN_USERS_DEFAULT_PAGE));
    expect(url.searchParams.get("limit")).toBe(String(ADMIN_USERS_DEFAULT_LIMIT));
    expect(result.items).toEqual([sampleUser]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  test("clamps page and limit query parameters to safe bounds", async () => {
    let capturedUrl = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        capturedUrl = String(input);
        return new Response(
          JSON.stringify({
            success: true,
            data: [],
            meta: { page: 1, limit: 20, total: 0 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
      { preconnect: (): void => {} },
    );

    await listAdminUsers(0, 0);
    let url = new URL(capturedUrl, "http://localhost");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("limit")).toBe(String(ADMIN_USERS_MIN_LIMIT));

    await listAdminUsers(5000, 200);
    url = new URL(capturedUrl, "http://localhost");
    expect(url.searchParams.get("page")).toBe("1000");
    expect(url.searchParams.get("limit")).toBe(String(ADMIN_USERS_MAX_LIMIT));
  });

  test("sends PATCH request to update user status", async () => {
    let method = "";
    let body = "";
    let path = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        path = String(input);
        method = init?.method ?? "GET";
        body = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: sampleUser.id, role: sampleUser.role, status: "inactive" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
      { preconnect: (): void => {} },
    );

    const result = await updateAdminUserStatus(sampleUser.id, "inactive");

    expect(method).toBe("PATCH");
    expect(path).toContain(`/api/v1/admin/users/${sampleUser.id}/status`);
    expect(JSON.parse(body)).toEqual({ status: "inactive" });
    expect(result.status).toBe("inactive");
  });

  test("rejects malformed user list response", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            success: true,
            data: [{ ...sampleUser, id: "invalid-uuid" }],
            meta: { page: 1, limit: 20, total: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      { preconnect: (): void => {} },
    );

    await expect(listAdminUsers()).rejects.toBeInstanceOf(ApiClientError);
  });

  test("rejects server error envelope with ApiClientError", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "FORBIDDEN", message: "Akses Dibatasi" },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
      { preconnect: (): void => {} },
    );

    await expect(listAdminUsers()).rejects.toBeInstanceOf(ApiClientError);
  });
});
