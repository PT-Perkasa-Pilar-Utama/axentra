import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchDocuments, type SearchResultItem } from "./search-documents.api";

export const SEARCH_DOCUMENTS_QUERY_KEY = ["search-documents"] as const;

export type SearchDocumentsPresenter = {
  inputValue: string;
  keyword: string;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  results: SearchResultItem[];
  handleInputChange: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  clearSearch: () => void;
  retry: () => Promise<void>;
};

export function useSearchDocumentsPresenter(): SearchDocumentsPresenter {
  const [inputValue, setInputValue] = useState("");
  const [keyword, setKeyword] = useState("");

  const query = useQuery({
    queryKey: [...SEARCH_DOCUMENTS_QUERY_KEY, keyword],
    queryFn: () => searchDocuments(keyword),
    enabled: keyword.trim().length > 0,
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
  }, []);

  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const isLoading = query.isFetching;

  return {
    inputValue,
    keyword,
    isLoading,
    isError: query.isError,
    isEmpty: query.isSuccess && query.data?.length === 0 && keyword.length > 0,
    results: query.data ?? [],
    handleInputChange,
    handleSubmit,
    clearSearch,
    retry,
  };
}
