import type { DocxPreviewText } from "./docx-text";

export type DocxPreviewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "ready"; paragraphs: string[]; truncated: boolean };

/** Memetakan status query teks DOCX ke keadaan yang ditampilkan view (CODING_STANDARD 4.5). */
export function deriveDocxPreviewState(query: {
  isError: boolean;
  data: DocxPreviewText | undefined;
}): DocxPreviewState {
  if (query.isError) return { status: "error" };
  if (query.data === undefined) return { status: "loading" };
  if (query.data.paragraphs.length === 0) return { status: "empty" };
  return {
    status: "ready",
    paragraphs: query.data.paragraphs,
    truncated: query.data.truncated,
  };
}
