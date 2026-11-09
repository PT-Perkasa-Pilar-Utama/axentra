import { describe, expect, test } from "bun:test";
import {
  ADMIN_DOCUMENTS_PATH,
  ADMIN_USERS_PATH,
  ANALYTICS_PATH,
  AUDIT_TRAIL_PATH,
  DASHBOARD_PATH,
  PERMISSION_CATEGORIES_PATH,
  ROLE_MENU,
  resolveShellRole,
  ADMIN_DASHBOARD_PATH,
} from "../src/app/app-shell.menu";

describe("AppShell Menu Configuration (FE-S4-05, FE-S4-06 & FE-S4-07)", () => {
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

    test("admin menu lists Dashboard, Manajemen Akun, Manajemen Dokumen, and Audit Trail in order", () => {
      expect(ROLE_MENU.admin.map((entry) => entry.label)).toEqual([
        "Dashboard",
        "Manajemen Akun",
        "Manajemen Dokumen",
        "Audit Trail",
      ]);
    });

    test("admin menu keeps the Manajemen Akun and Manajemen Dokumen entries per Opsi A", () => {
      const adminUsersEntry = ROLE_MENU.admin.find((entry) => entry.to === ADMIN_USERS_PATH);
      if (!adminUsersEntry) throw new Error("Expected admin users menu entry to exist");
      expect(adminUsersEntry.label).toBe("Manajemen Akun");
      expect(adminUsersEntry.icon).toBe("users");
      expect(adminUsersEntry.id).toBe("dashboard-admin-users-link");

      const adminDocsEntry = ROLE_MENU.admin.find((entry) => entry.to === ADMIN_DOCUMENTS_PATH);
      if (!adminDocsEntry) throw new Error("Expected admin documents menu entry to exist");
      expect(adminDocsEntry.label).toBe("Manajemen Dokumen");
      expect(adminDocsEntry.icon).toBe("document");
      expect(adminDocsEntry.id).toBe("admin-documents-link");
    });

    test("admin menu starts with the admin dashboard, not the Member Team dashboard", () => {
      const adminDashboardEntry = ROLE_MENU.admin[0];
      if (!adminDashboardEntry) throw new Error("Expected admin dashboard menu entry to exist");
      expect(adminDashboardEntry.to).toBe(ADMIN_DASHBOARD_PATH);
      expect(adminDashboardEntry.label).toBe("Dashboard");
      expect(adminDashboardEntry.icon).toBe("home");
      expect(adminDashboardEntry.id).toBe("admin-dashboard-link");
      expect(ROLE_MENU.admin.some((entry) => entry.to === DASHBOARD_PATH)).toBe(false);
    });

    test("admin menu includes the shared Audit Trail entry", () => {
      const auditTrailEntry = ROLE_MENU.admin.find((entry) => entry.to === AUDIT_TRAIL_PATH);
      if (!auditTrailEntry) throw new Error("Expected admin audit trail menu entry to exist");
      expect(auditTrailEntry.label).toBe("Audit Trail");
      expect(auditTrailEntry.icon).toBe("audit");
      expect(auditTrailEntry.id).toBe("dashboard-audit-trail-link");
    });
  });
});
