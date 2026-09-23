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
  requestedAt: z.iso.datetime().optional(),
  storageKey: z.string().min(1).optional(),
  enqueuedAt: z.iso.datetime().optional(),
});

export type DocumentProcessingJob = z.infer<typeof documentProcessingJobSchema>;

export const documentProcessJobName = documentProcessingJobName;
export const documentProcessJobSchema = documentProcessingJobSchema;
export type DocumentProcessJob = DocumentProcessingJob;
