import { z } from "zod";
import type { EnvironmentSource } from "./common";
import { formatConfigurationError } from "./common";

const webEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default("/api/v1"),
});

export type WebConfig = z.infer<typeof webEnvironmentSchema>;

export function loadWebConfig(source: EnvironmentSource): WebConfig {
  const result = webEnvironmentSchema.safeParse(source);
  if (!result.success) throw new Error(formatConfigurationError(result.error));
  return Object.freeze(result.data);
}
