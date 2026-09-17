import { livenessDataSchema, type LivenessData } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export function getPlatformStatus(): Promise<LivenessData> {
  return apiRequest("/health", livenessDataSchema);
}
