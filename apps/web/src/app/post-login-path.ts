import {
  ADMIN_DASHBOARD_PATH,
  DASHBOARD_PATH,
  ROLE_MENU,
  resolveShellRole,
  type ShellMenuEntry,
} from "./app-shell.menu";

function isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

function menuCovers(menu: readonly ShellMenuEntry[], path: string): boolean {
  return menu.some((entry) => isUnder(path, entry.to));
}

/**
 * Tujuan setelah login. Halaman asal dipakai kalau boleh diakses role yang baru login;
 * halaman milik role lain (mis. sisa sesi pengguna sebelumnya) diganti dasbor role ini.
 * Halaman di luar semua menu, seperti detail dokumen, tetap dipakai.
 */
export function resolvePostLoginPath(role: string | undefined, from: string | undefined): string {
  const shellRole = resolveShellRole(role);
  const home = shellRole === "admin" ? ADMIN_DASHBOARD_PATH : DASHBOARD_PATH;
  if (!from) return home;

  const belongsToSomeRole = Object.values(ROLE_MENU).some((menu) => menuCovers(menu, from));
  const belongsToThisRole = menuCovers(ROLE_MENU[shellRole], from);

  return belongsToSomeRole && !belongsToThisRole ? home : from;
}
