/** Galat transport dan envelope API, dipakai bersama oleh klien, pembaca envelope, dan jalur sesi. */
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

export function invalidResponse(status: number): ApiClientError {
  return new ApiClientError("INVALID_RESPONSE", "Respons server tidak valid", status);
}

export function toRequestError(error: unknown, callerAborted: boolean): ApiClientError {
  if (error instanceof ApiClientError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return callerAborted
      ? new ApiClientError("REQUEST_CANCELLED", "Permintaan dibatalkan", 0)
      : new ApiClientError("REQUEST_TIMEOUT", "Server tidak merespons tepat waktu", 0);
  }
  return new ApiClientError("NETWORK_ERROR", "Tidak dapat terhubung ke server", 0);
}

export function isUnauthorizedError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 || error.code === "UNAUTHORIZED" || error.code === "UNAUTHENTICATED")
  );
}
