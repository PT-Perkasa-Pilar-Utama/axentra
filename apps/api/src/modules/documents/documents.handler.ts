import type { Context } from "hono";
import {
  DOCUMENT_COPY,
  MAX_AGGREGATE_UPLOAD_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCX_BATCH_COUNT,
} from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { PayloadTooLargeError, ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { RawUploadFile } from "./documents.schema";
import type { DocumentService } from "./documents.service";
import { createBoundedStream } from "./documents.service.helpers";

export type DocumentHandlerDependencies = {
  documentService: DocumentService;
};

function isUploadedFile(value: unknown): value is File {
  return typeof value === "object" && value !== null && value instanceof File;
}

export function createDocumentUploadHandler(
  dependencies: DocumentHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    // 1. Fast pre-check on Content-Length header if provided
    const contentLengthHeader = context.req.header("content-length");
    if (contentLengthHeader) {
      const parsedLength = Number.parseInt(contentLengthHeader, 10);
      if (!Number.isNaN(parsedLength) && parsedLength > MAX_AGGREGATE_UPLOAD_SIZE_BYTES) {
        throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
      }
    }

    // 2. Validate Content-Type format
    const contentType = context.req.header("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ValidationError("Permintaan harus menggunakan format multipart/form-data");
    }

    // 3. Enforce ingress byte limit on request stream before multipart parsing
    let formData: { entries: () => Iterable<[string, unknown]> };
    try {
      if (context.req.raw.body) {
        const boundedStream = createBoundedStream(
          context.req.raw.body,
          MAX_AGGREGATE_UPLOAD_SIZE_BYTES,
        );
        const boundedResponse = new Response(boundedStream, {
          headers: context.req.raw.headers,
        });
        formData = await boundedResponse.formData();
      } else {
        formData = await context.req.formData();
      }
    } catch (error: unknown) {
      if (error instanceof PayloadTooLargeError) {
        throw error;
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string" &&
        error.message.includes(DOCUMENT_COPY.FILE_TOO_LARGE)
      ) {
        throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
      }
      throw new ValidationError("Gagal membaca data unggahan");
    }

    // 4. Validate batch constraints and extract files
    const rawFiles: Array<RawUploadFile> = [];
    let aggregateSize = 0;

    for (const [, value] of formData.entries()) {
      if (!isUploadedFile(value)) continue;

      if (rawFiles.length >= MAX_DOCX_BATCH_COUNT) {
        throw new ValidationError(DOCUMENT_COPY.EXCEEDS_DOCX_BATCH_LIMIT);
      }

      if (value.size === 0) {
        throw new ValidationError(DOCUMENT_COPY.EMPTY_FILE);
      }

      if (value.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
        throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
      }

      aggregateSize += value.size;
      if (aggregateSize > MAX_AGGREGATE_UPLOAD_SIZE_BYTES) {
        throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
      }

      const filename = typeof value.name === "string" ? value.name : "";
      const mimeType = value.type || "application/octet-stream";
      const bytes = new Uint8Array(await value.arrayBuffer());

      rawFiles.push({
        filename,
        size: value.size,
        mimeType,
        bytes,
      });
    }

    if (rawFiles.length === 0) {
      throw new ValidationError(DOCUMENT_COPY.NO_FILES);
    }

    const result = await dependencies.documentService.uploadDocuments(rawFiles);
    return jsonSuccess(context, result, 200);
  };
}

export function createUploadHandler(
  documentService: DocumentService,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return createDocumentUploadHandler({ documentService });
}
