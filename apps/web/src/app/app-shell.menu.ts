export type ShellRole = "member_team" | "head_of_team";

export type ShellIconName = "home" | "analytics" | "audit" | "permissions";

export type ShellMenuEntry = {
  id?: string | undefined;
  label: string;
  to: string;
  icon: ShellIconName;
};

export const DASHBOARD_PATH = "/dashboard";
export const ANALYTICS_PATH = "/analytics";
export const AUDIT_TRAIL_PATH = "/audit-trail";
export const PERMISSION_CATEGORIES_PATH = "/permission-categories";

const DASHBOARD_ENTRY: ShellMenuEntry = {
  id: "dashboard-home-link",
  label: "Dashboard",
  to: DASHBOARD_PATH,
  icon: "home",
};

const ANALYTICS_ENTRY: ShellMenuEntry = {
  label: "Analitik",
  to: ANALYTICS_PATH,
  icon: "analytics",
};

// id dipertahankan dari AppShell lama agar selector test yang sudah ada tetap berlaku.
const AUDIT_TRAIL_ENTRY: ShellMenuEntry = {
  id: "dashboard-audit-trail-link",
  label: "Audit Trail",
  to: AUDIT_TRAIL_PATH,
  icon: "audit",
};

const PERMISSION_CATEGORIES_ENTRY: ShellMenuEntry = {
  id: "dashboard-permissions-link",
  label: "Permission category",
  to: PERMISSION_CATEGORIES_PATH,
  icon: "permissions",
};

/**
 * Satu-satunya tempat menu per role diatur (13-app-shell.md, aturan 2).
 * Menu Admin ditambahkan oleh kartu Admin.
 */
export const ROLE_MENU: Record<ShellRole, readonly ShellMenuEntry[]> = {
  member_team: [DASHBOARD_ENTRY],
  head_of_team: [DASHBOARD_ENTRY, ANALYTICS_ENTRY, AUDIT_TRAIL_ENTRY, PERMISSION_CATEGORIES_ENTRY],
};

/** Admin memakai dasbor sendiri, jadi role selain Head of Team memakai menu Member Team. */
export function resolveShellRole(role: string | undefined): ShellRole {
  return role === "head_of_team" ? "head_of_team" : "member_team";
}
