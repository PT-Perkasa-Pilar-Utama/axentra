import type React from "react";

import { AppShell } from "./app-shell.view";
import { CategoryNavigationView } from "../features/categories/categories.view";
import { DocumentUploadAreaView } from "../features/document-upload/document-upload.view";
import { useMemberTeamDashboardPresenter } from "../features/member-team-dashboard/member-team-dashboard.presenter";
import { RecentDocumentsView } from "../features/recent-documents/recent-documents.view";
import { TopTagsView } from "../features/top-tags/top-tags.view";
import { SearchBarView } from "../features/search-documents/search-bar.view";
import { SearchResultsView } from "../features/search-documents/search-results.view";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const presenter = useMemberTeamDashboardPresenter();

  return (
    <AppShell roleExtras={<CategoryNavigationView presenter={presenter.categoriesPresenter} />}>
      <title>Dashboard | Axentra</title>
      <div className="min-w-0 px-4 sm:px-6 md:px-4" data-testid="member-team-dashboard">
        <header className="flex min-h-[4.5rem] items-center justify-between py-4">
          <h1 className="text-lg font-semibold leading-none">Dashboard</h1>
          <SearchBarView presenter={presenter.searchPresenter} />
        </header>

        <div className="space-y-6 pb-8">
          <TopTagsView
            presenter={presenter.topTagsPresenter}
            activeTagNames={presenter.tagFilter.activeTagNames}
            onTagClick={presenter.tagFilter.toggleTag}
          />

          {presenter.canUpload && <DocumentUploadAreaView presenter={presenter.uploadPresenter} />}

          {presenter.isSearching ? (
            <SearchResultsView presenter={presenter.searchPresenter} />
          ) : (
            <RecentDocumentsView presenter={presenter.documentsPresenter} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
