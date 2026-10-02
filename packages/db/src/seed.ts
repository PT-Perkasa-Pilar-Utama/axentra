import { closeDatabase, createDatabaseClient } from "./client";
import { assertAllowedDatabaseUrl, assertAllowedEnvironment } from "./env-guard";
import { resolveSeedUsers, seedUsers } from "./seeds/users";

export {
  assertAllowedDatabaseClient,
  assertAllowedDatabaseUrl,
  assertAllowedEnvironment,
} from "./env-guard";

export async function runUserSeed(options?: { authDirectory?: string }): Promise<void> {
  const runtimeEnv = Bun.env.APP_ENV ?? process.env.APP_ENV;
  assertAllowedEnvironment(runtimeEnv);

  const databaseUrl = Bun.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required to run seed");
  }
  assertAllowedDatabaseUrl(databaseUrl);

  const authDirectory = options?.authDirectory ?? Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY;
  if (authDirectory === undefined || authDirectory.trim().length === 0) {
    throw new Error(
      "AUTH_LOCAL_IDENTITY_DIRECTORY is required to run seed. Silent fallback to hardcoded dummy credentials is not permitted.",
    );
  }

  const client = createDatabaseClient(databaseUrl);
  try {
    console.info("Starting user seeder...");
    const usersToSeed = resolveSeedUsers(authDirectory);
    const seededRecords = await seedUsers(client, usersToSeed);
    console.info(`Successfully seeded ${seededRecords.length} users into PostgreSQL:\n`);

    const summary = seededRecords.map((record) => ({
      ID: record.id,
      Email: record.email,
      Name: record.name,
      Role: record.role,
    }));
    console.table(summary);

    console.info("Database seed completed successfully.");
  } finally {
    await closeDatabase(client);
  }
}

if (import.meta.main) {
  await runUserSeed();
}
