import type React from "react";

import { useAuthSession } from "../features/auth/auth-session.context";
import {
  PERMISSION_CATEGORIES_PAGE_TITLE,
  PermissionCategoriesView,
} from "../features/permission-categories/permission-categories.view";
import { resolveShellRole } from "./app-shell.menu";
import { AppShell } from "./app-shell.view";
import { HeadOfTeamCategoryNavigation } from "./head-of-team-category-navigation";

export function PermissionCategoriesPage(): React.JSX.Element {
  const { user } = useAuthSession();

  return (
    <AppShell
      role={resolveShellRole(user?.role)}
      title={PERMISSION_CATEGORIES_PAGE_TITLE}
      sidebarExtras={<HeadOfTeamCategoryNavigation />}
    >
      <PermissionCategoriesView />
    </AppShell>
  );
}
