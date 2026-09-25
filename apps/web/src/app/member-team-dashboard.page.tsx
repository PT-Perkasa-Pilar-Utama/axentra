import { NavLink } from "react-router";
import type React from "react";

import perkasaLogo from "../assets/perkasa-logo-sidebar.png";
import { useDocumentUploadPresenter } from "../features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../features/document-upload/document-upload.view";
import { RecentDocumentsView } from "../features/recent-documents/recent-documents.view";
import { useRecentDocumentsPresenter } from "../features/recent-documents/recent-documents.presenter";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const uploadPresenter = useDocumentUploadPresenter();
  const documentsPresenter = useRecentDocumentsPresenter(5);

  return (
    <main
      className="member-team-dashboard min-h-[100dvh] bg-[#f0f2f4] text-[#252930]"
      data-testid="member-team-dashboard"
    >
      <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[18.75rem_minmax(0,1fr)]">
        <aside className="hidden min-h-[100dvh] flex-col bg-[#25282e] px-4 py-6 text-white md:flex">
          <div className="mb-6 px-2">
            <img
              src={perkasaLogo}
              alt="PERKASA - Innovation Towards Intelligence"
              className="h-16 w-full max-w-[15.5rem] object-contain object-left"
            />
          </div>
          <nav aria-label="Navigasi utama">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  isActive ? "bg-[#65a448] text-white" : "text-gray-300 hover:bg-white/10"
                }`
              }
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
        </aside>

        <div className="min-w-0 px-4 sm:px-6 md:px-4">
          <header className="flex min-h-[4.5rem] items-center py-4">
            <h1 className="text-lg font-semibold leading-none">Dashboard</h1>
          </header>

          <div className="space-y-6 pb-8">
            <DocumentUploadAreaView presenter={uploadPresenter} />
            <RecentDocumentsView presenter={documentsPresenter} />
          </div>
        </div>
      </div>
    </main>
  );
}
