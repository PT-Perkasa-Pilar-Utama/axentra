import { fileURLToPath } from "node:url";

import { closeDatabase, createDatabaseClient } from "./client";
import { runMigrations } from "./migrations";

const databaseUrl = Bun.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const client = createDatabaseClient(databaseUrl);
try {
  await runMigrations(client, fileURLToPath(new URL("../drizzle", import.meta.url)));
  console.info("Database migrations completed");
} finally {
  await closeDatabase(client);
}
