import { paginationMetaSchema } from "@axentra/shared";
import type { PaginationMeta } from "@axentra/shared";
import type { ZodType } from "zod";
import {
  ApiClientError,
  invalidResponse,
  isErrorEnvelope,
  isSuccessEnvelope,
} from "./api-client.errors";

/** Hasil endpoint berhalaman: data dan meta paginasi dari envelope sukses. */
export type ApiPage<T> = { data: T; meta: PaginationMeta };

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

export async function readEnvelope<T>(response: Response, dataSchema: ZodType<T>): Promise<T> {
  const { data } = await readSuccessPayload(response);
  const parsedData = dataSchema.safeParse(data);
  if (!parsedData.success) {
    throw invalidResponse(response.status);
  }
  return parsedData.data;
}

export async function readPageEnvelope<T>(
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

export async function readBlob(response: Response): Promise<Blob> {
  if (response.ok) return response.blob();

  const payload = await readJsonOrNull(response);
  if (isErrorEnvelope(payload)) {
    throw new ApiClientError(payload.error.code, payload.error.message, response.status);
  }
  throw new ApiClientError("DOWNLOAD_FAILED", "Gagal mengunduh berkas", response.status);
}
