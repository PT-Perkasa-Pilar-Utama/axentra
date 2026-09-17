import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { DatabaseClient } from "./client";

export async function runMigrations(
  client: DatabaseClient,
  migrationsFolder: string,
): Promise<void> {
  await migrate(client.db, { migrationsFolder });
}
