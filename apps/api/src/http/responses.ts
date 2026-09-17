import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  ErrorDetail,
  PaginationMeta,
} from "@axentra/shared";

export function jsonSuccess<T>(
  context: Context,
  data: T,
  status: ContentfulStatusCode = 200,
  meta?: PaginationMeta,
): Response {
  const body: ApiSuccessEnvelope<T> =
    meta === undefined ? { success: true, data } : { success: true, data, meta };
  return context.json(body, status);
}

export function jsonError(
  context: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode,
  details?: ReadonlyArray<ErrorDetail>,
): Response {
  const error =
    details === undefined ? { code, message } : { code, message, details: [...details] };
  const body: ApiErrorEnvelope = { success: false, error };
  return context.json(body, status);
}
