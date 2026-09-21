import { z } from "zod";

export const systemHealthCheckJobName = "system.health-check" as const;

export const systemHealthCheckJobSchema = z.object({
  jobId: z.uuid(),
  schemaVersion: z.literal(1),
  requestedAt: z.iso.datetime(),
});

export type SystemHealthCheckJob = z.infer<typeof systemHealthCheckJobSchema>;

export const documentProcessJobName = "document.process" as const;

export const documentProcessJobSchema = z.object({
  jobId: z.uuid(),
  schemaVersion: z.literal(1),
  documentId: z.uuid(),
  storageKey: z.string().min(1),
  enqueuedAt: z.iso.datetime(),
});

export type DocumentProcessJob = z.infer<typeof documentProcessJobSchema>;
