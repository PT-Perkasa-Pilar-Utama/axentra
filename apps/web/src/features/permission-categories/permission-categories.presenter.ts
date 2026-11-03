import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api-client";
import {
  listPermissionCategories,
  updatePermissionCategory,
  type PermissionCategoryItem,
} from "./permission-categories.api";

export const PERMISSION_CATEGORIES_QUERY_KEY = ["permission-categories"] as const;
export const PERMISSION_CATEGORIES_STALE_TIME_MS = 30_000;

export type PermissionCategoriesPresenter = {
  categories: PermissionCategoryItem[];
  isLoading: boolean;
  isError: boolean;
  isAccessDenied: boolean;
  isEmpty: boolean;
  pendingCategoryId: string | null;
  toggleError: string | null;
  togglePermission: (categoryId: string, nextEnabled: boolean) => Promise<void>;
  retry: () => Promise<void>;
  clearToggleError: () => void;
};

export function usePermissionCategoriesPresenter(): PermissionCategoriesPresenter {
  const queryClient = useQueryClient();
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: PERMISSION_CATEGORIES_QUERY_KEY,
    queryFn: () => listPermissionCategories(),
    staleTime: PERMISSION_CATEGORIES_STALE_TIME_MS,
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && (error.status === 403 || error.status === 404))
        return false;
      return failureCount < 2;
    },
  });

  const mutation = useMutation({
    mutationFn: ({ categoryId, nextEnabled }: { categoryId: string; nextEnabled: boolean }) =>
      updatePermissionCategory(categoryId, nextEnabled),
    onMutate: ({ categoryId }) => {
      setPendingCategoryId(categoryId);
      setToggleError(null);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PERMISSION_CATEGORIES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-documents"] }),
        queryClient.invalidateQueries({ queryKey: ["search-documents"] }),
      ]);
    },
    onError: (error) => {
      setToggleError(
        error instanceof ApiClientError && error.status === 403
          ? "Anda tidak memiliki izin untuk mengubah izin unduh kategori."
          : "Gagal mengubah izin unduh kategori. Silakan coba lagi.",
      );
    },
    onSettled: () => setPendingCategoryId(null),
  });

  const togglePermission = useCallback(
    async (categoryId: string, nextEnabled: boolean): Promise<void> => {
      if (pendingCategoryId) return;
      try {
        await mutation.mutateAsync({ categoryId, nextEnabled });
      } catch {
        // Error state is exposed by onError.
      }
    },
    [mutation, pendingCategoryId],
  );

  const retry = useCallback(async (): Promise<void> => {
    setToggleError(null);
    await queryClient.invalidateQueries({ queryKey: PERMISSION_CATEGORIES_QUERY_KEY });
  }, [queryClient]);

  const clearToggleError = useCallback((): void => setToggleError(null), []);
  const isAccessDenied = query.error instanceof ApiClientError && query.error.status === 403;
  const isError = query.isError && !isAccessDenied;
  const categories = query.data ?? [];

  return {
    categories,
    isLoading: query.isLoading,
    isError,
    isAccessDenied,
    isEmpty: !query.isLoading && !isError && !isAccessDenied && categories.length === 0,
    pendingCategoryId,
    toggleError,
    togglePermission,
    retry,
    clearToggleError,
  };
}
