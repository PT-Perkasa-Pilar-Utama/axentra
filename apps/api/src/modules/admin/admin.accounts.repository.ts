import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { accountStatusAuditEvents, authSessions, users } from "@axentra/db";
import type { AccountStatus, AdminManagedRole, UserRole } from "@axentra/shared";

export type ManagedAccountRow = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  status: AccountStatus;
};

export type AccountStatusAuditRecord = {
  userId: string;
  userName: string | null;
  userEmail: string;
  previousStatus: AccountStatus;
  newStatus: AccountStatus;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string;
  changedAt: Date;
};

export type ManagedAccountPage = {
  items: ReadonlyArray<ManagedAccountRow & { role: AdminManagedRole }>;
  total: number;
};

export type IAdminAccountRepository = {
  listManagedAccounts: (limit: number, offset: number) => Promise<ManagedAccountPage>;
  // Runs the work in one transaction. Services own the boundary; repositories own the queries.
  runInTransaction: <T>(work: (tx: IAdminAccountRepository) => Promise<T>) => Promise<T>;
  // Locks every active Head of Team in id order, so concurrent deactivations cannot both pass the last-head check.
  lockActiveHeadOfTeamIds: () => Promise<ReadonlyArray<string>>;
  findAccountForUpdate: (userId: string) => Promise<ManagedAccountRow | null>;
  setStatus: (userId: string, status: AccountStatus, changedAt: Date) => Promise<void>;
  revokeActiveSessions: (userId: string, revokedAt: Date) => Promise<number>;
  insertStatusAudit: (record: AccountStatusAuditRecord) => Promise<void>;
};

const MANAGED_ROLES: ReadonlyArray<AdminManagedRole> = ["member_team", "head_of_team"];

export type DrizzleAdminAccountClient =
  | PostgresJsDatabase
  | Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

const accountColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
};

export class DrizzleAdminAccountRepository implements IAdminAccountRepository {
  public constructor(private readonly sqlDb: DrizzleAdminAccountClient) {}

  public async listManagedAccounts(limit: number, offset: number): Promise<ManagedAccountPage> {
    const managedRoles = inArray(users.role, [...MANAGED_ROLES]);
    const [totalRow] = await this.sqlDb.select({ total: count() }).from(users).where(managedRoles);
    const rows = await this.sqlDb
      .select(accountColumns)
      .from(users)
      .where(managedRoles)
      .orderBy(asc(users.email), asc(users.id))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.flatMap((row) => (isManagedRole(row.role) ? [{ ...row, role: row.role }] : [])),
      total: Number(totalRow?.total ?? 0),
    };
  }

  public async runInTransaction<T>(work: (tx: IAdminAccountRepository) => Promise<T>): Promise<T> {
    return this.sqlDb.transaction((tx) => work(new DrizzleAdminAccountRepository(tx)));
  }

  public async lockActiveHeadOfTeamIds(): Promise<ReadonlyArray<string>> {
    const rows = await this.sqlDb
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "head_of_team"), eq(users.status, "active")))
      .orderBy(asc(users.id))
      .for("update");
    return rows.map((row) => row.id);
  }

  public async findAccountForUpdate(userId: string): Promise<ManagedAccountRow | null> {
    const [row] = await this.sqlDb
      .select(accountColumns)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    return row ?? null;
  }

  public async setStatus(userId: string, status: AccountStatus, changedAt: Date): Promise<void> {
    await this.sqlDb
      .update(users)
      .set({ status, updatedAt: changedAt })
      .where(eq(users.id, userId));
  }

  public async revokeActiveSessions(userId: string, revokedAt: Date): Promise<number> {
    const revoked = await this.sqlDb
      .update(authSessions)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return revoked.length;
  }

  public async insertStatusAudit(record: AccountStatusAuditRecord): Promise<void> {
    await this.sqlDb.insert(accountStatusAuditEvents).values({
      userId: record.userId,
      userName: record.userName,
      userEmail: record.userEmail,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      actorUserId: record.actorUserId,
      actorName: record.actorName,
      actorEmail: record.actorEmail,
      changedAt: record.changedAt,
    });
  }
}

export function isManagedRole(role: UserRole): role is AdminManagedRole {
  return role === "member_team" || role === "head_of_team";
}

// Unit-test double. It has no real rollback; the Drizzle repository and integration tests cover transactions.
export class InMemoryAdminAccountRepository implements IAdminAccountRepository {
  public readonly accounts = new Map<string, ManagedAccountRow>();
  public readonly auditRecords: AccountStatusAuditRecord[] = [];
  public transactionCount = 0;
  private readonly sessions = new Map<string, { userId: string; revokedAt: Date | null }>();

  public addAccount(account: ManagedAccountRow): void {
    this.accounts.set(account.id, account);
  }

  public addSession(sessionId: string, userId: string): void {
    this.sessions.set(sessionId, { userId, revokedAt: null });
  }

  public isSessionRevoked(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session !== undefined && session.revokedAt !== null;
  }

  public async listManagedAccounts(limit: number, offset: number): Promise<ManagedAccountPage> {
    const managed = [...this.accounts.values()]
      .filter((account): account is ManagedAccountRow & { role: AdminManagedRole } =>
        isManagedRole(account.role),
      )
      .sort((left, right) =>
        left.email === right.email
          ? left.id.localeCompare(right.id)
          : left.email.localeCompare(right.email),
      );
    return { items: managed.slice(offset, offset + limit), total: managed.length };
  }

  public async runInTransaction<T>(work: (tx: IAdminAccountRepository) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return work(this);
  }

  public async lockActiveHeadOfTeamIds(): Promise<ReadonlyArray<string>> {
    return [...this.accounts.values()]
      .filter((account) => account.role === "head_of_team" && account.status === "active")
      .map((account) => account.id)
      .sort();
  }

  public async findAccountForUpdate(userId: string): Promise<ManagedAccountRow | null> {
    const account = this.accounts.get(userId);
    return account === undefined ? null : { ...account };
  }

  public async setStatus(userId: string, status: AccountStatus): Promise<void> {
    const account = this.accounts.get(userId);
    if (account !== undefined) this.accounts.set(userId, { ...account, status });
  }

  public async revokeActiveSessions(userId: string, revokedAt: Date): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revokedAt = revokedAt;
        revoked += 1;
      }
    }
    return revoked;
  }

  public async insertStatusAudit(record: AccountStatusAuditRecord): Promise<void> {
    this.auditRecords.push(record);
  }
}
