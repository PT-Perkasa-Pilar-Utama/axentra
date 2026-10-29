import type { UserRole } from "@axentra/shared";

/** Peran yang boleh mengunggah dokumen (BA US-01). API menolak peran lain dengan 403. */
export const DOCUMENT_UPLOAD_ROLE: UserRole = "member_team";

export function canUploadDocuments(role: UserRole | null | undefined): boolean {
  return role === DOCUMENT_UPLOAD_ROLE;
}
