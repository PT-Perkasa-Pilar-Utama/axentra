import { loadWebConfig } from "@axentra/config/web";
import { recentDocumentListResponseSchema } from "@axentra/shared";
import type { RecentDocumentListResponse } from "@axentra/shared";

const config = loadWebConfig(import.meta.env);

export type RecentDocument = RecentDocumentListResponse["data"][number];

export async function listRecentDocuments(page = 1, limit = 5): Promise<RecentDocument[]> {
  const url = `${config.VITE_API_BASE_URL}/api/v1/documents?page=${page}&limit=${limit}`;
  const res = await fetch(url, { credentials: "same-origin" });
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new Error("Respons server tidak valid");
  }

  const parsed = recentDocumentListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Respons server tidak sesuai kontrak API");
  }
  return parsed.data.data;
}
