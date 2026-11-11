import { describe, expect, test } from "bun:test";
import { ADMIN_DASHBOARD_PATH } from "../src/app/app-shell.menu";
import { resolvePostLoginPath } from "../src/app/post-login-path";

describe("resolvePostLoginPath", () => {
  test("sends admin to the admin dashboard when there is no origin page", () => {
    expect(resolvePostLoginPath("admin", undefined)).toBe(ADMIN_DASHBOARD_PATH);
  });

  test("sends member_team and head_of_team to /dashboard when there is no origin page", () => {
    expect(resolvePostLoginPath("member_team", undefined)).toBe("/dashboard");
    expect(resolvePostLoginPath("head_of_team", undefined)).toBe("/dashboard");
  });

  test("replaces a leftover /dashboard origin with the admin dashboard for admin", () => {
    expect(resolvePostLoginPath("admin", "/dashboard")).toBe(ADMIN_DASHBOARD_PATH);
  });

  test("returns to a page the logged-in role may open", () => {
    expect(resolvePostLoginPath("head_of_team", "/analytics")).toBe("/analytics");
    expect(resolvePostLoginPath("head_of_team", "/permission-categories")).toBe(
      "/permission-categories",
    );
    expect(resolvePostLoginPath("admin", "/audit-trail")).toBe("/audit-trail");
    expect(resolvePostLoginPath("admin", "/admin/documents/abc")).toBe("/admin/documents/abc");
  });

  test("does not send admin to a Head of Team page left by the previous user", () => {
    expect(resolvePostLoginPath("admin", "/permission-categories")).toBe(ADMIN_DASHBOARD_PATH);
    expect(resolvePostLoginPath("admin", "/analytics")).toBe(ADMIN_DASHBOARD_PATH);
  });

  test("does not send Head of Team or Member Team to an Admin page", () => {
    expect(resolvePostLoginPath("head_of_team", "/admin/users")).toBe("/dashboard");
    expect(resolvePostLoginPath("head_of_team", "/admin/documents/abc")).toBe("/dashboard");
    expect(resolvePostLoginPath("member_team", "/audit-trail")).toBe("/dashboard");
  });

  test("keeps pages outside every menu, such as a document detail", () => {
    expect(resolvePostLoginPath("member_team", "/documents/abc")).toBe("/documents/abc");
    expect(resolvePostLoginPath("head_of_team", "/upload")).toBe("/upload");
  });

  test("falls back to /dashboard for an unknown role", () => {
    expect(resolvePostLoginPath(undefined, undefined)).toBe("/dashboard");
  });
});
