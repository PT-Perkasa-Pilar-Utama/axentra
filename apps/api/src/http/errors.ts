import type { ErrorDetail } from "@axentra/shared";

export type ApplicationErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500;

export class AppError extends Error {
  public readonly code: string;
  public readonly status: ApplicationErrorStatus;
  public readonly details?: ReadonlyArray<ErrorDetail>;

  public constructor(
    code: string,
    message: string,
    status: ApplicationErrorStatus,
    details?: ReadonlyArray<ErrorDetail>,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export class ValidationError extends AppError {
  public constructor(message = "Data tidak valid", details?: ReadonlyArray<ErrorDetail>) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message = "Autentikasi diperlukan") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = "Anda tidak memiliki akses untuk tindakan ini") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  public constructor(message = "Data tidak ditemukan") {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends AppError {
  public constructor(code: string, message: string) {
    super(code, message, 409);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
