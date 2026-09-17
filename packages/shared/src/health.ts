import { z } from "zod";

export const dependencyStateSchema = z.enum(["ready", "unavailable"]);

export const livenessDataSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
});

export const readinessDataSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  service: z.string(),
  version: z.string(),
  dependencies: z.record(z.string(), dependencyStateSchema),
});

export type LivenessData = z.infer<typeof livenessDataSchema>;
export type ReadinessData = z.infer<typeof readinessDataSchema>;
