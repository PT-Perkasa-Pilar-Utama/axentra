import { MOCK_TOP_TAGS } from "../recent-documents/mock-data";
import type { GetTopTagsParams, TopTagsContext } from "./top-tags.api";

export type TopTag = (typeof MOCK_TOP_TAGS)[number];
export type { GetTopTagsParams, TopTagsContext };

export async function getTopTags(_params: GetTopTagsParams): Promise<TopTag[]> {
  await new Promise((r) => setTimeout(r, 200)); // simulasi latency
  return MOCK_TOP_TAGS;
}
