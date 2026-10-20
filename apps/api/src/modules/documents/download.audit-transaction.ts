import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import { AppError, isAppError } from "../../http/errors";

export type DownloadAuditLogContext = Readonly<Record<string, unknown>>;

// Drivers wrap the Postgres error, and its SQLSTATE code (for example 23503 or 55P03) sits on the cause.
function errorCause(error: unknown): unknown {
  return error instanceof Error ? error.cause : undefined;
}

// Runs a unit of work that writes download audit rows and fails closed: the caller only ever
// receives the generic server error. The raw database error carries the bound audit values (user,
// document, timestamp) in its params, so it is logged as a summary and never re-thrown. Errors
// that already are application errors, such as a revoked permission, pass through unchanged.
export async function runDownloadAuditTransaction<T>(
  logger: Logger | undefined,
  logMessage: string,
  context: DownloadAuditLogContext,
  unitOfWork: () => Promise<T>,
): Promise<T> {
  try {
    return await unitOfWork();
  } catch (error: unknown) {
    if (isAppError(error)) throw error;

    logger?.error(
      { ...context, error: summarizeError(error), cause: summarizeError(errorCause(error)) },
      logMessage,
    );
    throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan pada server", 500);
  }
}
