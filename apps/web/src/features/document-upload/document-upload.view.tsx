import type React from "react";
import { useDocumentUploadPresenter } from "./document-upload.presenter";
import { DocumentUploadAreaView } from "./document-upload-area.view";
import { UserSessionBadge } from "../auth/user-session-badge.view";

export type { DocumentUploadAreaViewProps } from "./document-upload-area.view";
export { DocumentUploadAreaView } from "./document-upload-area.view";

export type DocumentUploadPageProps = {
  disabled?: boolean;
};

export function DocumentUploadPage({
  disabled = false,
}: DocumentUploadPageProps = {}): React.JSX.Element {
  const presenter = useDocumentUploadPresenter();

  return (
    <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unggah Dokumen</h1>
          <p className="text-sm text-gray-500 mt-1">
            Unggah file PDF atau batch file DOCX untuk diproses ke dalam sistem manajemen dokumen.
          </p>
        </div>
        <UserSessionBadge />
      </div>
      <DocumentUploadAreaView presenter={presenter} disabled={disabled} />
    </main>
  );
}

export const DocumentUploadFeature = DocumentUploadPage;
export const DocumentUploadContainer = DocumentUploadPage;
export const DocumentUploadView = DocumentUploadAreaView;
