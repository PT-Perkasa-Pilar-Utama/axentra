import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api-client";
import {
  ADMIN_USERS_DEFAULT_LIMIT,
  ADMIN_USERS_DEFAULT_PAGE,
  ADMIN_USERS_MAX_PAGE,
  listAdminUsers,
  updateAdminUserStatus,
  type AdminUser,
  type AdminUserStatus,
} from "./admin-users.api";

export const ADMIN_USERS_QUERY_KEY = ["admin-users"] as const;

export type AdminUsersPresenter = {
  users: AdminUser[];
  page: number;
  total: number;
  first: number;
  last: number;
  hasPrevious: boolean;
  hasNext: boolean;
  isLoading: boolean;
  isError: boolean;
  isAccessDenied: boolean;
  confirmTarget: AdminUser | null;
  isPending: boolean;
  mutationError: string | null;
  previousPage: () => void;
  nextPage: () => void;
  retry: () => void;
  openConfirm: (user: AdminUser) => void;
  closeConfirm: () => void;
  confirmStatus: () => Promise<void>;
};

export function useAdminUsersPresenter(): AdminUsersPresenter {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(ADMIN_USERS_DEFAULT_PAGE);
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [...ADMIN_USERS_QUERY_KEY, page],
    queryFn: () => listAdminUsers(page, ADMIN_USERS_DEFAULT_LIMIT),
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) && count < 1,
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminUserStatus }) =>
      updateAdminUserStatus(id, status),
    onSuccess: async () => {
      setConfirmTarget(null);
      setMutationError(null);
      await queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === "LAST_HEAD_OF_TEAM") {
        setMutationError("Head of Team aktif terakhir tidak dapat dinonaktifkan.");
      } else if (error instanceof ApiClientError && error.status === 403) {
        setMutationError("Anda tidak memiliki izin untuk mengubah status akun.");
      } else {
        setMutationError("Status akun gagal diubah. Silakan coba lagi.");
      }
    },
  });

  const users = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;
  const currentPage = query.data?.meta.page ?? page;
  const limit = query.data?.meta.limit ?? ADMIN_USERS_DEFAULT_LIMIT;
  const first = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const last = Math.min(first + users.length - 1, total);
  const isAccessDenied = query.error instanceof ApiClientError && query.error.status === 403;

  return {
    users,
    page: currentPage,
    total,
    first,
    last: total === 0 ? 0 : last,
    hasPrevious: currentPage > ADMIN_USERS_DEFAULT_PAGE,
    hasNext: currentPage * limit < total && currentPage < ADMIN_USERS_MAX_PAGE,
    isLoading: query.isLoading,
    isError: query.isError && !isAccessDenied,
    isAccessDenied,
    confirmTarget,
    isPending: mutation.isPending,
    mutationError,
    previousPage: () => setPage((value) => Math.max(ADMIN_USERS_DEFAULT_PAGE, value - 1)),
    nextPage: () => setPage((value) => Math.min(ADMIN_USERS_MAX_PAGE, value + 1)),
    retry: () => void query.refetch(),
    openConfirm: (user) => {
      setMutationError(null);
      setConfirmTarget(user);
    },
    closeConfirm: () => {
      if (!mutation.isPending) setConfirmTarget(null);
    },
    confirmStatus: async () => {
      if (!confirmTarget || mutation.isPending) return;
      const status = confirmTarget.status === "active" ? "inactive" : "active";
      try {
        await mutation.mutateAsync({ id: confirmTarget.id, status });
      } catch {
        // Error state is exposed by onError.
      }
    },
  };
}
