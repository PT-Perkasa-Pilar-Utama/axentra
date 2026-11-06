import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { users } from "@axentra/db";
import type { AccountStatus, AuthUser } from "@axentra/shared";
import type { AuthCredentials, AuthUserRepository } from "./auth.types";

// Reads the users table that the seed and the admin flows maintain. The caller passes a normalized email.
export class DrizzleAuthUserRepository implements AuthUserRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findCredentialsByEmail(email: string): Promise<AuthCredentials | null> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      role: row.role,
      ...(row.name === null ? {} : { name: row.name }),
    };
    return { user, passwordHash: row.passwordHash, status: row.status };
  }

  public async findStatusById(userId: string): Promise<AccountStatus | null> {
    const rows = await this.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0]?.status ?? null;
  }
}
