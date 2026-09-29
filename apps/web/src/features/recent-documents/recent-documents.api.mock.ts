import { MOCK_DOCUMENTS } from "./mock-data";
import type { MockDocument } from "./mock-data";

// Ekspor tipe dengan nama yang sama seperti file aslinya agar presenter
// tidak perlu diubah saat swap import.
export type RecentDocument = MockDocument;

export async function listRecentDocuments(
  _page = 1,
  _limit = 5,
  tagIds?: readonly string[],
): Promise<MockDocument[]> {
  await new Promise((r) => setTimeout(r, 300)); // simulasi latency

  if (!tagIds || tagIds.length === 0) return MOCK_DOCUMENTS;

  // OR logic: dokumen muncul jika punya minimal satu tag yang aktif
  return MOCK_DOCUMENTS.filter((doc) => doc.tags.some((t) => tagIds.includes(t.id)));
}
