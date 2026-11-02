import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api-client";
import {
  listPermissionCategories,
  updatePermissionCategory,
  type PermissionCategoryItem,
} from "./permission-categories.api";

export const PERMISSION_CATEGORIES_QUERY_KEY = ["permission-categories"] as const;

const figmaPreviewCategories: PermissionCategoryItem[] = [
  {
    id: "11111111-1111-4111-8111-000000000001",
    name: "Reporting",
    slug: "reporting",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "11111111-1111-4111-8111-000000000002",
    name: "Analytics",
    slug: "analytics",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "11111111-1111-4111-8111-000000000003",
    name: "Dashboard",
    slug: "dashboard",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "11111111-1111-4111-8111-000000000004",
    name: "Insights",
    slug: "insights",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "11111111-1111-4111-8111-000000000005",
    name: "Performance",
    slug: "performance",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "11111111-1111-4111-8111-000000000006",
    name: "Trends",
    slug: "trends",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
];

export type PermissionCategoriesPresenter = {
  categories: PermissionCategoryItem[];
  isLoading: boolean;
  isError: boolean;
  isAccessDenied: boolean;
  isEmpty: boolean;
  isDevPreview: boolean;
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
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: PERMISSION_CATEGORIES_QUERY_KEY,
    queryFn: () => listPermissionCategories(),
    staleTime: 30 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && (error.status === 403 || error.status === 404))
        return false;
      return failureCount < 2;
    },
  });

  const isDevPreview =
    !query.data &&
    Boolean(import.meta.env?.DEV) &&
    query.error instanceof ApiClientError &&
    query.error.status === 404;

  const mutation = useMutation({
    mutationFn: async ({
      categoryId,
      nextEnabled,
    }: {
      categoryId: string;
      nextEnabled: boolean;
    }) => {
      if (isDevPreview) {
        setPreviewOverrides((previous) => ({ ...previous, [categoryId]: nextEnabled }));
        return;
      }
      return updatePermissionCategory(categoryId, nextEnabled);
    },
    onMutate: ({ categoryId }) => {
      setPendingCategoryId(categoryId);
      setToggleError(null);
    },
    onSuccess: async () => {
      if (!isDevPreview) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: PERMISSION_CATEGORIES_QUERY_KEY }),
          queryClient.invalidateQueries({ queryKey: ["categories"] }),
          queryClient.invalidateQueries({ queryKey: ["recent-documents"] }),
          queryClient.invalidateQueries({ queryKey: ["search-documents"] }),
        ]);
      }
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
  const isError = !isDevPreview && query.isError && !isAccessDenied;
  const categories = isDevPreview
    ? figmaPreviewCategories.map((category) => ({
        ...category,
        downloadEnabled: previewOverrides[category.id] ?? category.downloadEnabled,
      }))
    : (query.data ?? []);

  return {
    categories,
    isLoading: !isDevPreview && query.isLoading,
    isError,
    isAccessDenied,
    isEmpty: !query.isLoading && !isError && categories.length === 0,
    isDevPreview,
    pendingCategoryId,
    toggleError,
    togglePermission,
    retry,
    clearToggleError,
  };
}
