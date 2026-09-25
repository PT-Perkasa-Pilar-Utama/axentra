import type React from "react";
import {
  DocumentUploadAreaView,
  DocumentUploadNotificationView,
} from "../features/document-upload/document-upload.view";
import { useDocumentUploadPresenter } from "../features/document-upload/document-upload.presenter";
import { RecentDocumentsView } from "../features/recent-documents/recent-documents.view";
import { useRecentDocumentsPresenter } from "../features/recent-documents/recent-documents.presenter";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const presenter = useDocumentUploadPresenter();
  const recent = useRecentDocumentsPresenter(5);

  return (
    <main className="min-h-screen bg-[#f4f9ef]">
      <header className="border-b border-[#ddeece] bg-white px-6 py-4">
        <span className="text-sm font-semibold tracking-wide text-[#6fa84f]">AXENTRA</span>
        <span className="ml-3 text-sm text-gray-400">Dasbor Member Team</span>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold leading-normal text-gray-900">Unggah Dokumen</h1>
          <p className="mt-1 text-sm text-gray-500">
            Unggah file PDF atau batch file DOCX untuk diproses ke dalam sistem manajemen dokumen.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <DocumentUploadNotificationView presenter={presenter} />
            <DocumentUploadAreaView presenter={presenter} />
          </div>
          <div>
            <RecentDocumentsView presenter={recent} />
          </div>
        </div>
      </div>
    </main>
  );
}
