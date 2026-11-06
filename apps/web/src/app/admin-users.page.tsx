import type React from "react";
import { ADMIN_USERS_PAGE_TITLE, AdminUsersView } from "../features/admin-users/admin-users.view";
import { AppShell } from "./app-shell.view";

export function AdminUsersPage(): React.JSX.Element {
  return (
    <AppShell role="admin" title={ADMIN_USERS_PAGE_TITLE}>
      <AdminUsersView />
    </AppShell>
  );
}
