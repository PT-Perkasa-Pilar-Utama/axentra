import type React from "react";
import { ANALYTICS_ROLE } from "../features/analytics/analytics.access";
import { useAnalyticsPresenter } from "../features/analytics/analytics.presenter";
import { ANALYTICS_PAGE_TITLE, AnalyticsView } from "../features/analytics/analytics.view";
import { AppShell } from "./app-shell.view";
import { HeadOfTeamCategoryNavigation } from "./head-of-team-category-navigation";

export function AnalyticsPage(): React.JSX.Element {
  const presenter = useAnalyticsPresenter();

  return (
    <AppShell
      role={ANALYTICS_ROLE}
      title={ANALYTICS_PAGE_TITLE}
      className="analytics-page"
      testId="analytics-page"
      sidebarExtras={<HeadOfTeamCategoryNavigation />}
    >
      <AnalyticsView presenter={presenter} />
    </AppShell>
  );
}
