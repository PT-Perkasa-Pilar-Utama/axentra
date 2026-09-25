import { closeDatabase, createDatabaseClient } from "./client";
import { DUMMY_USERS, generateLocalIdentityDirectory, seedUsers } from "./seeds/users";

const databaseUrl = Bun.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required to run seed");
}

const client = createDatabaseClient(databaseUrl);
try {
  console.info("Starting user seeder...");
  const seededRecords = await seedUsers(client, DUMMY_USERS);
  console.info(`Successfully seeded ${seededRecords.length} dummy users into PostgreSQL:\n`);

  const summary = seededRecords.map((record) => {
    const def = DUMMY_USERS.find((d) => d.id === record.id);
    return {
      ID: record.id,
      Email: record.email,
      Name: record.name,
      Role: record.role,
      Password: def?.plainPassword ?? "(hidden)",
    };
  });
  console.table(summary);

  const base64Directory = generateLocalIdentityDirectory(seededRecords);
  console.info("\nAUTH_LOCAL_IDENTITY_DIRECTORY for .env (API local auth):");
  console.info(base64Directory);
  console.info("\nDatabase seed completed successfully.");
} finally {
  await closeDatabase(client);
}
