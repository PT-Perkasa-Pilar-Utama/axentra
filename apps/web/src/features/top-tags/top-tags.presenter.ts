import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MAX_FILTER_TAGS,
  TOP_TAGS_DEFAULT_LIMIT,
  TOP_TAGS_MAX_CONTEXT_DOCUMENTS,
} from "@axentra/shared";

import { getTopTags } from "./top-tags.api";
import type { TopTagsContext } from "./top-tags.api";

export const TOP_TAGS_QUERY_KEY = ["top-tags"] as const;

export type TopTagItem = {
  name: string;
};

export type TagFilterPresenter = {
  activeTagNames: ReadonlySet<string>;
  activeTagList: readonly string[];
  toggleTag: (name: string) => void;
  clearTags: () => void;
};

// Satu sumber state filter tag untuk dasbor dan hasil pencarian (AC-04.03, AC-04.04).
// Logika AND dijalankan server; klien hanya mengirim daftar tag yang sudah terurut.
export function useTagFilterPresenter(): TagFilterPresenter {
  const [activeTagNames, setActiveTagNames] = useState<ReadonlySet<string>>(() => new Set());

  const toggleTag = useCallback((name: string): void => {
    setActiveTagNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else if (next.size < MAX_FILTER_TAGS) {
        next.add(name);
      }
      return next;
    });
  }, []);

  const clearTags = useCallback((): void => {
    setActiveTagNames(new Set());
  }, []);

  const activeTagList = useMemo(
    () => [...activeTagNames].sort((a, b) => a.localeCompare(b)),
    [activeTagNames],
  );

  return { activeTagNames, activeTagList, toggleTag, clearTags };
}

export type TopTagsPresenterOptions = {
  context: TopTagsContext;
  documentIds?: readonly string[] | undefined;
  activeTagNames?: readonly string[] | undefined;
  limit?: number | undefined;
};

export type TopTagsPresenter = {
  isLoading: boolean;
  isError: boolean;
  tags: TopTagItem[];
  retry: () => Promise<void>;
};

export function useTopTagsPresenter(options: TopTagsPresenterOptions): TopTagsPresenter {
  const { context, activeTagNames = [], limit = TOP_TAGS_DEFAULT_LIMIT } = options;
  // Server menolak documentIds di luar konteks search, jadi hanya konteks itu yang membawanya.
  const documentIds =
    context === "search"
      ? options.documentIds?.slice(0, TOP_TAGS_MAX_CONTEXT_DOCUMENTS)
      : undefined;
  // Konteks pencarian tanpa dokumen tidak punya tag relevan untuk diminta (AC-04.01).
  const hasScope = context === "dashboard" || (documentIds?.length ?? 0) > 0;

  const query = useQuery({
    queryKey: [...TOP_TAGS_QUERY_KEY, context, limit, documentIds ?? []],
    queryFn: () => getTopTags({ context, limit, documentIds }),
    enabled: hasScope,
    staleTime: 60 * 1000,
    retry: 1,
    // Daftar lama hanya dipertahankan dalam konteks yang sama agar chip tidak berkedip.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === context ? previousData : undefined,
  });

  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  // Tag aktif selalu ditampilkan agar bisa dilepas, meski tidak ada di daftar teratas.
  const apiNames = (query.data ?? []).map((tag) => tag.name);
  const knownNames = new Set(apiNames);
  const names = [...apiNames, ...activeTagNames.filter((name) => !knownNames.has(name))];

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    tags: names.map((name) => ({ name })),
    retry,
  };
}
