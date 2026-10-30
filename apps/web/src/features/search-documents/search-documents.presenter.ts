import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchDocuments, type SearchResultItem } from "./search-documents.api";

export const SEARCH_DOCUMENTS_QUERY_KEY = ["search-documents"] as const;
const SEARCH_EMPTY_MESSAGE = "Tidak ada hasil yang ditemukan";

export type SearchDocumentsPresenter = {
  inputValue: string;
  keyword: string;
  categoryId?: string | undefined;
  /** true bila ada kata kunci atau kategori; tanpa keduanya panel hasil tidak ditampilkan. */
  isActive: boolean;
  heading: string;
  /** Copy wajib BA untuk pencarian kosong (CODING_STANDARD §11). */
  emptyMessage: string;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  hasResults: boolean;
  results: SearchResultItem[];
  resultIds: string[];
  handleInputChange: (value: string) => void;
  handleSubmit: (e: { preventDefault: () => void }) => void;
  clearSearch: () => void;
  setCategoryFilter: (id: string | undefined) => void;
  retry: () => Promise<void>;
};

// activeTagNames berasal dari filter Top Tags bersama; hasil pencarian ikut difilter (AC-04.03).
export function useSearchDocumentsPresenter(
  activeTagNames: readonly string[] = [],
): SearchDocumentsPresenter {
  const [inputValue, setInputValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const tags = useMemo(
    () => [...activeTagNames].sort((a, b) => a.localeCompare(b)),
    [activeTagNames],
  );

  const query = useQuery({
    queryKey: [...SEARCH_DOCUMENTS_QUERY_KEY, keyword, categoryId, tags],
    queryFn: () => searchDocuments(keyword, categoryId, tags),
    enabled: keyword.trim().length > 0 || categoryId !== undefined,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const handleSubmit = useCallback(
    (e: { preventDefault: () => void }) => {
      e.preventDefault();
      setKeyword(inputValue.trim());
    },
    [inputValue],
  );

  const clearSearch = useCallback(() => {
    setInputValue("");
    setKeyword("");
    setCategoryId(undefined);
  }, []);

  const setCategoryFilter = useCallback((id: string | undefined) => {
    setCategoryId(id);
  }, []);

  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const isLoading = query.isFetching;
  const isError = query.isError;
  const results = query.data ?? [];
  const isEmpty =
    query.isSuccess && results.length === 0 && (keyword.length > 0 || categoryId !== undefined);
  const hasResults = !isLoading && !isError && results.length > 0;
  const isActive = keyword.length > 0 || categoryId !== undefined;

  return {
    inputValue,
    keyword,
    categoryId,
    isActive,
    heading: keyword ? `Hasil Pencarian: "${keyword}"` : "Dokumen dalam kategori",
    emptyMessage: keyword ? SEARCH_EMPTY_MESSAGE : "Tidak ada dokumen dalam kategori ini",
    isLoading,
    isError,
    isEmpty,
    hasResults,
    results,
    resultIds: results.map((item) => item.id),
    handleInputChange,
    handleSubmit,
    clearSearch,
    setCategoryFilter,
    retry,
  };
}
