import { NavLink } from "react-router";
import type React from "react";

import perkasaLogo from "../assets/perkasa-logo-sidebar.png";
import { CategoryNavigationView } from "../features/categories/categories.view";
import { useDocumentUploadPresenter } from "../features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../features/document-upload/document-upload.view";
import { RecentDocumentsView } from "../features/recent-documents/recent-documents.view";
import { useRecentDocumentsPresenter } from "../features/recent-documents/recent-documents.presenter";
import { useTopTagsPresenter } from "../features/top-tags/top-tags.presenter";
import { TopTagsView } from "../features/top-tags/top-tags.view";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const uploadPresenter = useDocumentUploadPresenter();

  const topTagsPresenter = useTopTagsPresenter("dashboard");

  const documentsPresenter = useRecentDocumentsPresenter(5, topTagsPresenter.activeTagNames);

  return (
    <main
      className="member-team-dashboard min-h-[100dvh] bg-[#f0f2f4] text-[#252930]"
      data-testid="member-team-dashboard"
    >
      <title>Dashboard | Axentra</title>
      <meta
        name="description"
        content="Kelola unggahan dan lihat dokumen terbaru di dasbor Axentra."
      />
      <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[18.75rem_minmax(0,1fr)]">
        <aside className="dashboard-sidebar">
          <div className="dashboard-sidebar-brand">
            <img
              src={perkasaLogo}
              alt="PERKASA - Innovation Towards Intelligence"
              className="dashboard-sidebar-logo"
            />
          </div>
          <nav aria-label="Navigasi utama">
            <NavLink
              id="dashboard-home-link"
              to="/dashboard"
              className={({ isActive }) => `dashboard-sidebar-link${isActive ? " is-active" : ""}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
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
          <header className="flex min-h-[4.5rem] items-center py-4">
            <h1 className="text-lg font-semibold leading-none">Dashboard</h1>
          </header>

          <div className="space-y-6 pb-8">
            <TopTagsView
              presenter={topTagsPresenter}
              activeTagNames={topTagsPresenter.activeTagNames}
              onTagClick={topTagsPresenter.toggleTag}
            />

            <DocumentUploadAreaView presenter={uploadPresenter} />
            <RecentDocumentsView presenter={documentsPresenter} />
          </div>
        </div>
      </div>
    </main>
  );
}
