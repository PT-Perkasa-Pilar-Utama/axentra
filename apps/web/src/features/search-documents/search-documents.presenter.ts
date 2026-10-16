import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchDocuments, type SearchResultItem } from "./search-documents.api";

export const SEARCH_DOCUMENTS_QUERY_KEY = ["search-documents"] as const;

export type SearchDocumentsPresenter = {
  inputValue: string;
  keyword: string;
  categoryId?: string | undefined;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  hasResults: boolean;
  results: SearchResultItem[];
  handleInputChange: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  clearSearch: () => void;
  setCategoryFilter: (id: string | undefined) => void;
  retry: () => Promise<void>;
};

export function useSearchDocumentsPresenter(): SearchDocumentsPresenter {
  const [inputValue, setInputValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();

  const query = useQuery({
    queryKey: [...SEARCH_DOCUMENTS_QUERY_KEY, keyword, categoryId],
    queryFn: () => searchDocuments(keyword, categoryId),
    enabled: keyword.trim().length > 0 || categoryId !== undefined,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
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

  return {
    inputValue,
    keyword,
    categoryId,
    isLoading,
    isError,
    isEmpty,
    hasResults,
    results,
    handleInputChange,
    handleSubmit,
    clearSearch,
    setCategoryFilter,
    retry,
  };
}
