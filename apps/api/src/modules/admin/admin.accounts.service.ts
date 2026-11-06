import type {
  AccountStatus,
  AdminManagedRole,
  AdminUser,
  AdminUserStatusResult,
  AuthUser,
  PaginationMeta,
} from "@axentra/shared";
import { AppError, NotFoundError } from "../../http/errors";
import {
  isManagedRole,
  type IAdminAccountRepository,
  type ManagedAccountRow,
} from "./admin.accounts.repository";

export type ListManagedAccountsQuery = { page: number; limit: number };

export type ListManagedAccountsResult = {
  items: ReadonlyArray<AdminUser>;
  meta: PaginationMeta;
};

export type UpdateAccountStatusInput = {
  actor: AuthUser;
  userId: string;
  status: AccountStatus;
};

export type AdminAccountService = {
  listManagedAccounts: (query: ListManagedAccountsQuery) => Promise<ListManagedAccountsResult>;
  updateAccountStatus: (input: UpdateAccountStatusInput) => Promise<AdminUserStatusResult>;
};

export type AdminAccountServiceOptions = {
  now?: (() => Date) | undefined;
};

type ManagedAccount = ManagedAccountRow & { role: AdminManagedRole };

function toAdminUser(account: ManagedAccount): AdminUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
  };
}

function toStatusResult(account: ManagedAccount, status: AccountStatus): AdminUserStatusResult {
  return { id: account.id, role: account.role, status };
}

export function createAdminAccountService(
  repository: IAdminAccountRepository,
  options?: AdminAccountServiceOptions | undefined,
): AdminAccountService {
  const now = options?.now ?? (() => new Date());

  return {
    async listManagedAccounts(query: ListManagedAccountsQuery): Promise<ListManagedAccountsResult> {
      const page = await repository.listManagedAccounts(
        query.limit,
        (query.page - 1) * query.limit,
      );
      return {
        items: page.items.map(toAdminUser),
        meta: { page: query.page, limit: query.limit, total: page.total },
      };
    },

    async updateAccountStatus(input: UpdateAccountStatusInput): Promise<AdminUserStatusResult> {
      const changedAt = now();

      return repository.runInTransaction(async (tx) => {
        // Heads of Team are locked first, in id order, then the target row. Every change takes the
        // locks in this order, so two concurrent deactivations cannot deadlock or both pass the last-head check.
        const activeHeadIds = await tx.lockActiveHeadOfTeamIds();
        const target = await tx.findAccountForUpdate(input.userId);
        if (target === null) throw new NotFoundError("Pengguna tidak ditemukan");
        if (!isManagedRole(target.role)) {
          throw new AppError(
            "INVALID_TARGET_ROLE",
            "Peran akun ini tidak dapat diubah statusnya",
            422,
          );
        }
        const account: ManagedAccount = { ...target, role: target.role };

        if (account.status === input.status) return toStatusResult(account, input.status);

        if (
          input.status === "inactive" &&
          account.role === "head_of_team" &&
          activeHeadIds.length <= 1
        ) {
          throw new AppError(
            "LAST_HEAD_OF_TEAM",
            "Head of Team aktif terakhir tidak dapat dinonaktifkan",
            422,
          );
        }

        await tx.setStatus(account.id, input.status, changedAt);
        if (input.status === "inactive") {
          await tx.revokeActiveSessions(account.id, changedAt);
        }
        await tx.insertStatusAudit({
          userId: account.id,
          userName: account.name,
          userEmail: account.email,
          previousStatus: account.status,
          newStatus: input.status,
          actorUserId: input.actor.id,
          actorName: input.actor.name ?? null,
          actorEmail: input.actor.email,
          changedAt,
        });

        return toStatusResult(account, input.status);
      });
    },
  };
}
