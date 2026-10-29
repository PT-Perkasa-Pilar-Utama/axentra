import { loadWebConfig } from "@axentra/config/web";
import type { ZodType } from "zod";
import { readBlob, readEnvelope, readPageEnvelope, type ApiPage } from "./api-client.envelope";
import { toRequestError } from "./api-client.errors";
import { mergeRequestHeaders, withSessionRecovery } from "./api-client.session";

// Satu-satunya modul Web yang memanggil fetch (CODING_STANDARD 4.4). Galat, pembaca envelope, dan
// jalur sesi dipisah ke api-client.errors, api-client.envelope, dan api-client.session, lalu
// diekspor ulang di sini agar impor yang ada tetap memakai "lib/api-client".
export { ApiClientError, isErrorEnvelope, isSuccessEnvelope } from "./api-client.errors";
export type { ApiPage } from "./api-client.envelope";
export {
  mergeRequestHeaders,
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "./api-client.session";

/** Batas waktu default untuk permintaan JSON. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** Batas waktu untuk transfer berkas (unggah dan unduh); berkas dapat mencapai 50 MB. */
export const FILE_TRANSFER_TIMEOUT_MS = 180_000;

const DOWNLOAD_ACCEPT = "application/zip, application/octet-stream, application/json";

const config = loadWebConfig(import.meta.env);

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
  return withSessionRecovery(plan.sessionEndpoint, () =>
    sendOnce(plan, (response) => readEnvelope(response, dataSchema)),
  );
}

/** Seperti apiRequest, tetapi juga mengembalikan meta paginasi (wajib ada dan valid). */
export async function apiRequestPage<T>(
  path: string,
  dataSchema: ZodType<T>,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<ApiPage<T>> {
  const plan = planRequest(path, init, options, DEFAULT_REQUEST_TIMEOUT_MS);
  return withSessionRecovery(plan.sessionEndpoint, () =>
    sendOnce(plan, (response) => readPageEnvelope(response, dataSchema)),
  );
}

export async function apiDownloadRequest(
  path: string,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<Blob> {
  const plan = planRequest(path, withDownloadAccept(init), options, FILE_TRANSFER_TIMEOUT_MS);
  return withSessionRecovery(plan.sessionEndpoint, () => sendOnce(plan, readBlob));
}
