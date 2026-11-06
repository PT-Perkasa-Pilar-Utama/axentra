export type ShellRole = "member_team" | "head_of_team" | "admin";

export type ShellIconName = "home" | "analytics" | "audit" | "permissions" | "users";

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
export const ADMIN_USERS_PATH = "/admin/users";

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

const ADMIN_USERS_ENTRY: ShellMenuEntry = {
  id: "dashboard-admin-users-link",
  label: "Manajemen Akun",
  to: ADMIN_USERS_PATH,
  icon: "users",
};

/**
 * Satu-satunya tempat menu per role diatur (13-app-shell.md, aturan 2).
 * FE-S4-05 menambahkan entri tunggal Manajemen Akun untuk peran admin sesuai arahan Tech Lead;
 * entri menu Admin lainnya tetap milik FE-S4-07.
 */
export const ROLE_MENU: Record<ShellRole, readonly ShellMenuEntry[]> = {
  member_team: [DASHBOARD_ENTRY],
  head_of_team: [DASHBOARD_ENTRY, ANALYTICS_ENTRY, AUDIT_TRAIL_ENTRY, PERMISSION_CATEGORIES_ENTRY],
  admin: [ADMIN_USERS_ENTRY],
};

/** Mengembalikan ShellRole sesuai peran pengguna. */
export function resolveShellRole(role: string | undefined): ShellRole {
  if (role === "admin") return "admin";
  if (role === "head_of_team") return "head_of_team";
  return "member_team";
}
