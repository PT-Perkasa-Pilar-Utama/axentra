import type React from "react";

import { useAuthSession } from "../features/auth/auth-session.context";
import { AuditTrailSearchView } from "../features/audit-trail/audit-trail-search.view";
import { useAuditTrailPresenter } from "../features/audit-trail/audit-trail.presenter";
import { AUDIT_TRAIL_PAGE_TITLE, AuditTrailView } from "../features/audit-trail/audit-trail.view";
import { resolveShellRole } from "./app-shell.menu";
import { AppShell } from "./app-shell.view";
import { HeadOfTeamCategoryNavigation } from "./head-of-team-category-navigation";

export function AuditTrailPage(): React.JSX.Element {
  const { user } = useAuthSession();
  const presenter = useAuditTrailPresenter();
  const role = resolveShellRole(user?.role);

  return (
    <AppShell
      role={role}
      title={AUDIT_TRAIL_PAGE_TITLE}
      actions={<AuditTrailSearchView presenter={presenter} />}
      sidebarExtras={role === "head_of_team" ? <HeadOfTeamCategoryNavigation /> : undefined}
    >
      <AuditTrailView presenter={presenter} />
    </AppShell>
  );
}
