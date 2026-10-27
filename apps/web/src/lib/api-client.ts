import { loadWebConfig } from "@axentra/config/web";
import { paginationMetaSchema } from "@axentra/shared";
import type { PaginationMeta } from "@axentra/shared";
import type { ZodType } from "zod";

/** Batas waktu default untuk permintaan JSON. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** Batas waktu untuk transfer berkas (unggah dan unduh); berkas dapat mencapai 50 MB. */
export const FILE_TRANSFER_TIMEOUT_MS = 180_000;

const DOWNLOAD_ACCEPT = "application/zip, application/octet-stream, application/json";

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

export type ApiRequestOptions = {
  /** Batas waktu per percobaan. Default 15 detik (JSON) atau 180 detik (transfer berkas). */
  timeoutMs?: number;
  /**
   * Untuk endpoint sesi (login, refresh, logout): tanpa bearer token dan tanpa jalur
   * refresh-and-retry atau pengalihan ke /login saat 401.
   */
  sessionEndpoint?: boolean;
};

type RequestPlan = {
  path: string;
  init: RequestInit | undefined;
  timeoutMs: number;
  sessionEndpoint: boolean;
};

let authTokenGetter: (() => string | null) | null = null;
let unauthorizedHandler: (() => void) | null = null;
let sessionRefresher: (() => Promise<boolean>) | null = null;

export function setAuthTokenGetter(getter: (() => string | null) | null): void {
  authTokenGetter = getter;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** Dipanggil saat 401; mengembalikan true bila sesi diperbarui dan permintaan boleh diulang. */
export function setSessionRefresher(refresher: (() => Promise<boolean>) | null): void {
  sessionRefresher = refresher;
}

export function mergeRequestHeaders(input?: HeadersInit, includeAuth = true): Headers {
  const headers = new Headers(input);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  if (includeAuth && !headers.has("authorization")) {
    const token = authTokenGetter ? authTokenGetter() : null;
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  return headers;
}

function planRequest(
  path: string,
  init: RequestInit | undefined,
  options: ApiRequestOptions | undefined,
  defaultTimeoutMs: number,
): RequestPlan {
  return {
    path,
    init,
    timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
    sessionEndpoint: options?.sessionEndpoint ?? false,
  };
}

function invalidResponse(status: number): ApiClientError {
  return new ApiClientError("INVALID_RESPONSE", "Respons server tidak valid", status);
}

function toRequestError(error: unknown, callerAborted: boolean): ApiClientError {
  if (error instanceof ApiClientError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return callerAborted
      ? new ApiClientError("REQUEST_CANCELLED", "Permintaan dibatalkan", 0)
      : new ApiClientError("REQUEST_TIMEOUT", "Server tidak merespons tepat waktu", 0);
  }
  return new ApiClientError("NETWORK_ERROR", "Tidak dapat terhubung ke server", 0);
}

/** Satu percobaan HTTP; timeout mencakup pembacaan body. */
async function sendOnce<T>(
  plan: RequestPlan,
  readBody: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), plan.timeoutMs);
  const callerSignal = plan.init?.signal ?? null;
  try {
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;
    const response = await fetch(`${config.VITE_API_BASE_URL}${plan.path}`, {
      ...plan.init,
      credentials: "include",
      headers: mergeRequestHeaders(plan.init?.headers, !plan.sessionEndpoint),
      signal,
    });
    return await readBody(response);
  } catch (error) {
    throw toRequestError(error, callerSignal?.aborted === true);
  } finally {
    clearTimeout(timeout);
  }
}

function isUnauthorizedError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 || error.code === "UNAUTHORIZED" || error.code === "UNAUTHENTICATED")
  );
}

async function renewSession(): Promise<boolean> {
  if (!sessionRefresher) return false;
  try {
    return await sessionRefresher();
  } catch {
    return false;
  }
}

/**
 * Pada 401 dari endpoint terproteksi: refresh sesi sekali (single-flight di pemanggil),
 * lalu ulangi permintaan sekali. Bila gagal, sesi dihapus dan pengalihan dipicu.
 */
async function withSessionRecovery<T>(plan: RequestPlan, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (plan.sessionEndpoint || !isUnauthorizedError(error)) throw error;

    if (await renewSession()) {
      try {
        return await run();
      } catch (retryError) {
        if (isUnauthorizedError(retryError)) unauthorizedHandler?.();
        throw retryError;
      }
    }

    unauthorizedHandler?.();
    throw error;
  }
}

type SuccessPayload = { data: unknown; meta: unknown };

/** Membaca envelope sukses (data dan meta mentah); envelope error dipetakan ke ApiClientError. */
async function readSuccessPayload(response: Response): Promise<SuccessPayload> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponse(response.status);
  }

  if (isErrorEnvelope(payload)) {
    throw new ApiClientError(payload.error.code, payload.error.message, response.status);
  }
  if (!response.ok || !isSuccessEnvelope<unknown>(payload)) {
    throw invalidResponse(response.status);
  }
  return { data: payload.data, meta: "meta" in payload ? payload.meta : undefined };
}

async function readEnvelope<T>(response: Response, dataSchema: ZodType<T>): Promise<T> {
  const { data } = await readSuccessPayload(response);
  const parsedData = dataSchema.safeParse(data);
  if (!parsedData.success) {
    throw invalidResponse(response.status);
  }
  return parsedData.data;
}

async function readPageEnvelope<T>(
  response: Response,
  dataSchema: ZodType<T>,
): Promise<ApiPage<T>> {
  const { data, meta } = await readSuccessPayload(response);
  const parsedData = dataSchema.safeParse(data);
  const parsedMeta = paginationMetaSchema.safeParse(meta);
  if (!parsedData.success || !parsedMeta.success) {
    throw invalidResponse(response.status);
  }
  return { data: parsedData.data, meta: parsedMeta.data };
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readBlob(response: Response): Promise<Blob> {
  if (response.ok) return response.blob();

  const payload = await readJsonOrNull(response);
  if (isErrorEnvelope(payload)) {
    throw new ApiClientError(payload.error.code, payload.error.message, response.status);
  }
  throw new ApiClientError("DOWNLOAD_FAILED", "Gagal mengunduh berkas", response.status);
}

function withDownloadAccept(init: RequestInit | undefined): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", DOWNLOAD_ACCEPT);
  return { ...init, headers };
}

export async function apiRequest<T>(
  path: string,
  dataSchema: ZodType<T>,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<T> {
  const plan = planRequest(path, init, options, DEFAULT_REQUEST_TIMEOUT_MS);
  return withSessionRecovery(plan, () =>
    sendOnce(plan, (response) => readEnvelope(response, dataSchema)),
  );
}

/** Hasil endpoint berhalaman: data dan meta paginasi dari envelope sukses. */
export type ApiPage<T> = { data: T; meta: PaginationMeta };

/** Seperti apiRequest, tetapi juga mengembalikan meta paginasi (wajib ada dan valid). */
export async function apiRequestPage<T>(
  path: string,
  dataSchema: ZodType<T>,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<ApiPage<T>> {
  const plan = planRequest(path, init, options, DEFAULT_REQUEST_TIMEOUT_MS);
  return withSessionRecovery(plan, () =>
    sendOnce(plan, (response) => readPageEnvelope(response, dataSchema)),
  );
}

export async function apiDownloadRequest(
  path: string,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<Blob> {
  const plan = planRequest(path, withDownloadAccept(init), options, FILE_TRANSFER_TIMEOUT_MS);
  return withSessionRecovery(plan, () => sendOnce(plan, readBlob));
}
