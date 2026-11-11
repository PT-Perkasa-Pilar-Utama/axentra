import type React from "react";

import { AdminDashboardUpdatedAt } from "../features/admin-dashboard/admin-dashboard-updated-at.view";
import { useAdminDashboardPresenter } from "../features/admin-dashboard/admin-dashboard.presenter";
import {
  ADMIN_DASHBOARD_PAGE_TITLE,
  ADMIN_DASHBOARD_SUBTITLE,
  AdminDashboardView,
} from "../features/admin-dashboard/admin-dashboard.view";
import { useAuthSession } from "../features/auth/auth-session.context";
import { ADMIN_USERS_PATH } from "./app-shell.menu";
import { resolveShellRole } from "./app-shell.menu";
import { AppShell } from "./app-shell.view";

export function AdminDashboardPage(): React.JSX.Element {
  const { user } = useAuthSession();
  const presenter = useAdminDashboardPresenter();

  return (
    <AppShell
      role={resolveShellRole(user?.role)}
      title={ADMIN_DASHBOARD_PAGE_TITLE}
      subtitle={ADMIN_DASHBOARD_SUBTITLE}
      testId="admin-dashboard-page"
      actions={
        presenter.updatedAtLabel ? (
          <AdminDashboardUpdatedAt label={presenter.updatedAtLabel} />
        ) : undefined
      }
    >
      <AdminDashboardView presenter={presenter} manageAccountsHref={ADMIN_USERS_PATH} />
    </AppShell>
  );
}
