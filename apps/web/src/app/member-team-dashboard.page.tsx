import { useEffect } from "react";
import { useSearchParams } from "react-router";
import type React from "react";

import { useAuthSession } from "../features/auth/auth-session.context";
import { CATEGORY_LINK_PARAM } from "../features/categories/categories.link";
import { CategoryNavigationView } from "../features/categories/categories.view";
import { DocumentUploadAreaView } from "../features/document-upload/document-upload.view";
import { useMemberTeamDashboardPresenter } from "../features/member-team-dashboard/member-team-dashboard.presenter";
import { RecentDocumentsView } from "../features/recent-documents/recent-documents.view";
import { TopTagsView } from "../features/top-tags/top-tags.view";
import { SearchBarView } from "../features/search-documents/search-bar.view";
import { SearchResultsView } from "../features/search-documents/search-results.view";
import { AppShell } from "./app-shell.view";
import { resolveShellRole } from "./app-shell.menu";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const presenter = useMemberTeamDashboardPresenter();
  const { user } = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedCategoryId = searchParams.get(CATEGORY_LINK_PARAM);
  const { setCategoryFilter } = presenter.searchPresenter;

  // Kategori dari sidebar halaman lain (mis. Analitik) diterapkan sekali, lalu parameternya dibuang.
  useEffect(() => {
    if (!linkedCategoryId) return;
    setCategoryFilter(linkedCategoryId);
    setSearchParams({}, { replace: true });
  }, [linkedCategoryId, setCategoryFilter, setSearchParams]);

  return (
    <AppShell
      role={resolveShellRole(user?.role)}
      title="Dashboard"
      className="member-team-dashboard"
      testId="member-team-dashboard"
      actions={<SearchBarView presenter={presenter.searchPresenter} />}
      sidebarExtras={<CategoryNavigationView presenter={presenter.categoriesPresenter} />}
    >
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
    </AppShell>
  );
}
