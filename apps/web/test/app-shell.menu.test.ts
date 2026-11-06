import { describe, expect, test } from "bun:test";
import {
  ADMIN_USERS_PATH,
  ANALYTICS_PATH,
  AUDIT_TRAIL_PATH,
  DASHBOARD_PATH,
  PERMISSION_CATEGORIES_PATH,
  ROLE_MENU,
  resolveShellRole,
} from "../src/app/app-shell.menu";

describe("AppShell Menu Configuration (FE-S4-05 & FE-S4-07)", () => {
  describe("resolveShellRole", () => {
    test("resolves admin role to admin", () => {
      expect(resolveShellRole("admin")).toBe("admin");
    });

    test("resolves head_of_team role to head_of_team", () => {
      expect(resolveShellRole("head_of_team")).toBe("head_of_team");
    });

    test("resolves member_team role to member_team", () => {
      expect(resolveShellRole("member_team")).toBe("member_team");
    });

    test("falls back to member_team for undefined or unknown role", () => {
      expect(resolveShellRole(undefined)).toBe("member_team");
      expect(resolveShellRole("unknown_role")).toBe("member_team");
    });
  });

  describe("ROLE_MENU", () => {
    test("member_team menu contains Dashboard entry only", () => {
      expect(ROLE_MENU.member_team).toHaveLength(1);
      const entry = ROLE_MENU.member_team[0];
      if (!entry) throw new Error("Expected member_team menu entry to exist");
      expect(entry.to).toBe(DASHBOARD_PATH);
      expect(entry.label).toBe("Dashboard");
    });

    test("head_of_team menu contains Dashboard, Analitik, Audit Trail, and Permission category", () => {
      expect(ROLE_MENU.head_of_team).toHaveLength(4);
      expect(ROLE_MENU.head_of_team.map((e) => e.to)).toEqual([
        DASHBOARD_PATH,
        ANALYTICS_PATH,
        AUDIT_TRAIL_PATH,
        PERMISSION_CATEGORIES_PATH,
      ]);
    });

    test("admin menu contains Manajemen Akun entry delivered in FE-S4-05 per Opsi A", () => {
      expect(ROLE_MENU.admin).toHaveLength(1);
      const adminUsersEntry = ROLE_MENU.admin[0];
      if (!adminUsersEntry) throw new Error("Expected admin menu entry to exist");
      expect(adminUsersEntry.to).toBe(ADMIN_USERS_PATH);
      expect(adminUsersEntry.label).toBe("Manajemen Akun");
      expect(adminUsersEntry.icon).toBe("users");
      expect(adminUsersEntry.id).toBe("dashboard-admin-users-link");
    });
  });
});
