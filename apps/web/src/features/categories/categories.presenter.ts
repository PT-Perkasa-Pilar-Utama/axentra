import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCategories } from "./categories.api";
import type { CategorySummary } from "./categories.api";

export const CATEGORIES_QUERY_KEY = ["categories"] as const;

export type CategoriesPresenter = {
  categories: CategorySummary[];
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  selectedCategoryId?: string | undefined;
  selectCategory: (id: string) => void;
  clearCategory: () => void;
  retry: () => Promise<void>;
};

export function useCategoriesPresenter(
  selectedCategoryId?: string | undefined,
  onSelectCategory?: ((id: string | undefined) => void) | undefined,
): CategoriesPresenter {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => listCategories(),
    staleTime: 30 * 1000,
    retry: 1,
  });

  const categories = query.data ?? [];

  const selectCategory = useCallback(
    (id: string): void => {
      if (onSelectCategory) {
        onSelectCategory(selectedCategoryId === id ? undefined : id);
      }
    },
    [onSelectCategory, selectedCategoryId],
  );

  const clearCategory = useCallback((): void => {
    if (onSelectCategory) {
      onSelectCategory(undefined);
    }
  }, [onSelectCategory]);

  const retry = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
  }, [queryClient]);

  return {
    categories,
    isLoading: query.isLoading,
    isError: query.isError,
    isEmpty: !query.isLoading && !query.isError && categories.length === 0,
    selectedCategoryId,
    selectCategory,
    clearCategory,
    retry,
  };
}
