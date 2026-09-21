import { z } from "zod";

export const systemHealthCheckJobName = "system.health-check" as const;

export const systemHealthCheckJobSchema = z.object({
  jobId: z.uuid(),
  schemaVersion: z.literal(1),
  requestedAt: z.iso.datetime(),
});

export type SystemHealthCheckJob = z.infer<typeof systemHealthCheckJobSchema>;

export const documentProcessingJobName = "document.process" as const;

export const documentProcessingJobSchema = z.object({
  jobId: z.uuid(),
  documentId: z.uuid(),
  schemaVersion: z.literal(1),
  requestedAt: z.iso.datetime(),
});

export type DocumentProcessingJob = z.infer<typeof documentProcessingJobSchema>;
