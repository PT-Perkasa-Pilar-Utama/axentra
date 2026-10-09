import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getTopTags } from "./top-tags.api";
import type { TopTagsContext } from "./top-tags.api";

// TODO(FE-S2-04): Wire useTopTagsPresenter with context="search" and the current
// search-result documentIds inside the search results page. The presenter and API
// already accept documentIds for this purpose; the caller site belongs in the
// search feature introduced by FE-S2-04 (AC-04.01 search-results context).
export const TOP_TAGS_QUERY_KEY = ["top-tags"] as const;

export type TopTagItem = {
  id: string;
  name: string;
};

export type TopTagsPresenter = {
  isLoading: boolean;
  isError: boolean;
  tags: TopTagItem[];
  activeTagNames: ReadonlySet<string>;
  toggleTag: (name: string) => void;
  clearTags: () => void;
  retry: () => Promise<void>;
};

export function useTopTagsPresenter(
  context: TopTagsContext,
  limit = 10,
  documentIds?: string[],
): TopTagsPresenter {
  const query = useQuery({
    queryKey: [...TOP_TAGS_QUERY_KEY, context, limit, documentIds ?? []],
    queryFn: () => getTopTags({ context, limit, documentIds }),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const [activeTagNames, setActiveTagNames] = useState<ReadonlySet<string>>(new Set());

  const toggleTag = useCallback((name: string): void => {
    setActiveTagNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const clearTags = useCallback((): void => {
    setActiveTagNames(new Set());
  }, []);

  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const rawTags = query.data ?? [];

  return {
    isLoading: query.isPending,
    isError: query.isError,
    tags: rawTags.map(({ id, name }) => ({ id, name })),
    activeTagNames,
    toggleTag,
    clearTags,
    retry,
  };
}
