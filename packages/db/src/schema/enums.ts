import { pgEnum } from "drizzle-orm/pg-core";

export const processingStatusEnum = pgEnum("processing_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);
