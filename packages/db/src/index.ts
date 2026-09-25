export type { DatabaseClient } from "./client";
export { checkDatabase, closeDatabase, createDatabaseClient } from "./client";
export { runMigrations } from "./migrations";
export * from "./schema";
export {
  DUMMY_USERS,
  generateLocalIdentityDirectory,
  hashUserPassword,
  seedUsers,
  type SeedUserDefinition,
  type SeededUserRecord,
} from "./seeds/users";
