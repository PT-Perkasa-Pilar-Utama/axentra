import { loadWebConfig } from "@axentra/config/web";
import type { ZodType } from "zod";
import { getAuthToken } from "./auth-token.store";

const requestTimeoutMs = 10000;

const config = loadWebConfig(import.meta.env);

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export function isErrorEnvelope(
  value: unknown,
): value is { success: false; error: { code: string; message: string } } {
  if (value === null || typeof value !== "object") return false;
  if (!("success" in value) || value.success !== false) return false;
  if (!("error" in value) || value.error === null || typeof value.error !== "object") return false;
  return (
    "code" in value.error &&
    typeof value.error.code === "string" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  );
}

export function isSuccessEnvelope<T>(value: unknown): value is { success: true; data: T } {
  return (
    value !== null &&
    typeof value === "object" &&
    "success" in value &&
    value.success === true &&
    "data" in value
  );
}

export function mergeRequestHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  const token = getAuthToken();
  if (token !== null && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return headers;
}

export async function apiRequest<T>(
  path: string,
  dataSchema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    const response = await fetch(`${config.VITE_API_BASE_URL}${path}`, {
      ...init,
      headers: mergeRequestHeaders(init?.headers),
      signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiClientError("INVALID_RESPONSE", "Respons server tidak valid", response.status);
    }
    if (!response.ok || isErrorEnvelope(payload)) {
      if (isErrorEnvelope(payload)) {
        throw new ApiClientError(payload.error.code, payload.error.message, response.status);
      }
      throw new ApiClientError("INVALID_RESPONSE", "Respons server tidak valid", response.status);
    }
    if (!isSuccessEnvelope<T>(payload)) {
      throw new ApiClientError("INVALID_RESPONSE", "Respons server tidak valid", response.status);
    }
    const parsedData = dataSchema.safeParse(payload.data);
    if (!parsedData.success) {
      throw new ApiClientError("INVALID_RESPONSE", "Respons server tidak valid", response.status);
    }
    return parsedData.data;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      if (init?.signal?.aborted) {
        throw new ApiClientError("REQUEST_CANCELLED", "Permintaan dibatalkan", 0);
      }
      throw new ApiClientError("REQUEST_TIMEOUT", "Server tidak merespons tepat waktu", 0);
    }
    throw new ApiClientError("NETWORK_ERROR", "Tidak dapat terhubung ke server", 0);
  } finally {
    clearTimeout(timeout);
  }
}
