import type React from "react";
import { useRelatedDocumentsPresenter } from "./related-documents.presenter";
import { RelatedDocumentsView } from "./related-documents.view";

export type RelatedDocumentsSectionProps = {
  documentId: string;
};

// Hook pencarian Dokumen Terkait hanya dipanggil saat bagian ini ditampilkan.
export function RelatedDocumentsSection({
  documentId,
}: RelatedDocumentsSectionProps): React.JSX.Element {
  const related = useRelatedDocumentsPresenter(documentId);
  return <RelatedDocumentsView presenter={related} />;
}
