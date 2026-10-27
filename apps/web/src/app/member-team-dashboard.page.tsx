import { NavLink } from "react-router";
import type React from "react";

import perkasaLogo from "../assets/perkasa-logo-sidebar.png";
import { CategoryNavigationView } from "../features/categories/categories.view";
import { useCategoriesPresenter } from "../features/categories/categories.presenter";
import { canUploadDocuments } from "../features/document-upload/document-upload.access";
import { useDocumentUploadPresenter } from "../features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../features/document-upload/document-upload.view";
import { RecentDocumentsView } from "../features/recent-documents/recent-documents.view";
import { useRecentDocumentsPresenter } from "../features/recent-documents/recent-documents.presenter";
import {
  useTagFilterPresenter,
  useTopTagsPresenter,
} from "../features/top-tags/top-tags.presenter";
import { TopTagsView } from "../features/top-tags/top-tags.view";
import { useSearchDocumentsPresenter } from "../features/search-documents/search-documents.presenter";
import { SearchBarView } from "../features/search-documents/search-bar.view";
import { SearchResultsView } from "../features/search-documents/search-results.view";
import { useAuthSession } from "../features/auth/auth-session.context";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const { user } = useAuthSession();
  const canUpload = canUploadDocuments(user?.role);
  const uploadPresenter = useDocumentUploadPresenter();
  const tagFilter = useTagFilterPresenter();
  const documentsPresenter = useRecentDocumentsPresenter(5, tagFilter.activeTagList);
  const searchPresenter = useSearchDocumentsPresenter(tagFilter.activeTagList);
  const categoriesPresenter = useCategoriesPresenter(
    searchPresenter.categoryId,
    searchPresenter.setCategoryFilter,
  );

  const isSearching =
    searchPresenter.keyword.length > 0 || searchPresenter.categoryId !== undefined;
  // Konteks Top Tags mengikuti mode: dasbor memakai tag global, pencarian memakai hasilnya (AC-04.01).
  const topTagsPresenter = useTopTagsPresenter({
    context: isSearching ? "search" : "dashboard",
    documentIds: isSearching ? searchPresenter.resultIds : undefined,
    activeTagNames: tagFilter.activeTagList,
  });

  return (
    <main
      className="member-team-dashboard min-h-[100dvh] bg-[#f0f2f4] text-[#252930]"
      data-testid="member-team-dashboard"
    >
      <title>Dashboard | Axentra</title>
      <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[18.75rem_minmax(0,1fr)]">
        <aside className="dashboard-sidebar">
          {/* ... (Sidebar navigasi sama persis) ... */}
          <div className="dashboard-sidebar-brand">
            <img src={perkasaLogo} alt="PERKASA" className="dashboard-sidebar-logo" />
          </div>
          <nav aria-label="Navigasi utama">
            <NavLink
              id="dashboard-home-link"
              to="/dashboard"
              className="dashboard-sidebar-link is-active"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z" />
              </svg>
              <span>Dashboard</span>
            </NavLink>
          </nav>
          <CategoryNavigationView presenter={categoriesPresenter} />
        </aside>

        <div className="min-w-0 px-4 sm:px-6 md:px-4">
          <header className="flex min-h-[4.5rem] items-center justify-between py-4">
            <h1 className="text-lg font-semibold leading-none">Dashboard</h1>
            <SearchBarView presenter={searchPresenter} />
          </header>

          <div className="space-y-6 pb-8">
            <TopTagsView
              presenter={topTagsPresenter}
              activeTagNames={tagFilter.activeTagNames}
              onTagClick={tagFilter.toggleTag}
            />

            {canUpload && <DocumentUploadAreaView presenter={uploadPresenter} />}

            {isSearching ? (
              <SearchResultsView presenter={searchPresenter} />
            ) : (
              <RecentDocumentsView presenter={documentsPresenter} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
