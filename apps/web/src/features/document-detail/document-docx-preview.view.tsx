import type React from "react";
import type { DocxPreviewState } from "./document-docx-preview.presenter";

export type DocumentDocxPreviewProps = {
  state: DocxPreviewState;
  onRetry: () => void;
};

// Teks dirender sebagai node teks React (bukan innerHTML). whitespace-pre-wrap menjaga tab dan
// baris baru dari paragraf yang berasal dari w:tab dan w:br.
export function DocumentDocxPreview({
  state,
  onRetry,
}: DocumentDocxPreviewProps): React.JSX.Element {
  if (state.status === "loading") {
    return (
      <div className="document-preview-state" role="status" aria-busy="true">
        <p>Memuat pratinjau dokumen...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <section className="document-preview-state" aria-labelledby="docx-preview-error-heading">
        <h2 id="docx-preview-error-heading">Pratinjau DOCX gagal dimuat</h2>
        <p>Dokumen belum dapat ditampilkan. Coba muat ulang pratinjau.</p>
        <button type="button" onClick={onRetry}>
          Coba lagi
        </button>
      </section>
    );
  }

  if (state.status === "empty") {
    return (
      <section className="document-preview-state">
        <p>Dokumen tidak memiliki teks</p>
      </section>
    );
  }

  return (
    <article
      className="w-full max-w-3xl mx-auto bg-white rounded-xl p-6 text-sm leading-relaxed text-gray-800 space-y-3 overflow-y-auto"
      aria-label="Teks dokumen"
    >
      {state.paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {paragraph}
        </p>
      ))}
      {state.truncated && (
        <p className="text-xs text-gray-500">Teks dipotong karena melebihi batas pratinjau.</p>
      )}
    </article>
  );
}
