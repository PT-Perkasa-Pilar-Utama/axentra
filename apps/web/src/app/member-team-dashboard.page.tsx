import { NavLink } from "react-router";
import type React from "react";

import perkasaLogo from "../assets/perkasa-logo-sidebar.png";
import { CategoryNavigationView } from "../features/categories/categories.view";
import { useDocumentUploadPresenter } from "../features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../features/document-upload/document-upload.view";
import { RecentDocumentsView } from "../features/recent-documents/recent-documents.view";
import { useRecentDocumentsPresenter } from "../features/recent-documents/recent-documents.presenter";
import { useSearchDocumentsPresenter } from "../features/search-documents/search-documents.presenter";
import {
  SearchBarView,
  SearchResultsView,
} from "../features/search-documents/search-documents.view";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const uploadPresenter = useDocumentUploadPresenter();
  const documentsPresenter = useRecentDocumentsPresenter(5);
  const searchPresenter = useSearchDocumentsPresenter();

  const isSearching = searchPresenter.keyword.length > 0;

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
          <CategoryNavigationView />
        </aside>

        <div className="min-w-0 px-4 sm:px-6 md:px-4">
          <header className="flex min-h-[4.5rem] items-center justify-between py-4">
            <h1 className="text-lg font-semibold leading-none">Dashboard</h1>
            <SearchBarView presenter={searchPresenter} />
          </header>

          <div className="space-y-6 pb-8">
            <DocumentUploadAreaView presenter={uploadPresenter} />

            {/* Swap HANYA di area daftar dokumen */}
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
