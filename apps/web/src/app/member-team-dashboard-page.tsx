import type React from "react";
import { useDocumentUploadPresenter } from "../features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../features/document-upload/document-upload.view";

export function MemberTeamDashboardPage(): React.JSX.Element {
  const uploadPresenter = useDocumentUploadPresenter();

  return (
    <main
      data-testid="member-team-dashboard"
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <header className="mb-6">
        <h1 className="text-xl! font-semibold! leading-normal! tracking-normal! text-gray-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Unggah dan kelola dokumen tim Anda dari satu tempat.
        </p>
      </header>

      <section aria-labelledby="dashboard-upload-heading" data-testid="dashboard-upload-area">
        <h2 id="dashboard-upload-heading" className="mb-2 text-sm font-semibold text-gray-700">
          Unggah Dokumen
        </h2>
        <DocumentUploadAreaView presenter={uploadPresenter} />
      </section>
    </main>
  );
}

export default MemberTeamDashboardPage;
