import { users } from "@axentra/db";
import type { DatabaseClient } from "@axentra/db";
import type { UserRole } from "@axentra/shared";

// Upload stores documents.uploaded_by with a foreign key to users. An integration fixture that
// authenticates as a fixed identity therefore needs that identity to exist in the database.
// Email is derived from the id so it never collides with seeded accounts.
export async function ensureUploaderUser(
  database: DatabaseClient,
  id: string,
  role: UserRole,
): Promise<void> {
  await database.db
    .insert(users)
    .values({
      id,
      email: `${id}@integration.axentra.invalid`,
      passwordHash: "integration-fixture",
      role,
    })
    .onConflictDoNothing();
}
