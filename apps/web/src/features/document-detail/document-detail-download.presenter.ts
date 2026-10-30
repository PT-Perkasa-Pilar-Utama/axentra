import { DOWNLOAD_ACCESS_DENIED_MESSAGE } from "@axentra/shared";

export type DownloadStatus = "idle" | "loading" | "success" | "denied" | "error";
export type DownloadButtonTone = "primary" | "busy" | "blocked";
export type DownloadNoteTone = "muted" | "error";

export type DownloadControlState = {
  label: string;
  /** Tombol nonaktif saat unduhan diproses, ditolak (403), atau kategori tidak mengizinkan unduh. */
  isBlocked: boolean;
  buttonTone: DownloadButtonTone;
  note: string;
  noteTone: DownloadNoteTone;
};

function deriveDownloadNote(status: DownloadStatus, canDownload: boolean): string {
  if (status === "idle") {
    return canDownload ? "Unduh dalam format asli" : DOWNLOAD_ACCESS_DENIED_MESSAGE;
  }
  if (status === "loading") return "Menyiapkan tautan unduhan...";
  if (status === "success") return "Unduhan dimulai...";
  if (status === "denied") return "Anda tidak memiliki izin mengunduh dokumen ini.";
  return "Unduhan gagal. Silakan coba lagi.";
}

export function deriveDownloadControlState(
  status: DownloadStatus,
  canDownload: boolean,
): DownloadControlState {
  const isBlocked = status === "loading" || status === "denied" || !canDownload;
  let buttonTone: DownloadButtonTone = "primary";
  if (status === "loading") {
    buttonTone = "busy";
  } else if (isBlocked) {
    buttonTone = "blocked";
  }
  const hasNoteError = status === "error" || status === "denied" || !canDownload;

  return {
    label: status === "loading" ? "Menyiapkan..." : "Download",
    isBlocked,
    buttonTone,
    note: deriveDownloadNote(status, canDownload),
    noteTone: hasNoteError ? "error" : "muted",
  };
}
