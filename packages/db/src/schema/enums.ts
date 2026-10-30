import { pgEnum } from "drizzle-orm/pg-core";

export const processingStatusEnum = pgEnum("processing_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

export const userRoleEnum = pgEnum("user_role", ["member_team", "head_of_team", "admin"]);
