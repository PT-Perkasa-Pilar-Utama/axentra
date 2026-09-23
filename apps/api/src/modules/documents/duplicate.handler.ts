import type { Context } from "hono";
import {
  checkDuplicateRequestSchema,
  DOCUMENT_COPY,
  MAX_AGGREGATE_UPLOAD_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { PayloadTooLargeError, ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import { createBoundedStream } from "./documents.service.helpers";
import type { DocumentService } from "./documents.service";

export type DuplicateHandlerDependencies = {
  documentService: DocumentService;
};

function isUploadedFile(value: unknown): value is File {
  return typeof value === "object" && value !== null && value instanceof File;
}

export function createCheckDuplicateHandler(
  dependencies: DuplicateHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const contentType = context.req.header("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const rawBody: unknown = await context.req.json().catch(() => null);
      const parsed = checkDuplicateRequestSchema.safeParse(rawBody);

      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "contentHash",
          message: issue.message,
        }));
        throw new ValidationError("Data tidak valid", details);
      }

      const result = await dependencies.documentService.checkDuplicate({
        contentHash: parsed.data.contentHash,
        algorithm: parsed.data.hashAlgorithm,
      });

      return jsonSuccess(context, result, 200);
    }

    if (contentType.includes("multipart/form-data")) {
      const contentLengthHeader = context.req.header("content-length");
      if (contentLengthHeader) {
        const parsedLength = Number.parseInt(contentLengthHeader, 10);
        if (!Number.isNaN(parsedLength) && parsedLength > MAX_AGGREGATE_UPLOAD_SIZE_BYTES) {
          throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
        }
      }

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
        throw new ValidationError("Gagal membaca data form");
      }

      let targetFile: File | null = null;
      for (const [, value] of formData.entries()) {
        if (isUploadedFile(value)) {
          targetFile = value;
          break;
        }
      }

      if (!targetFile) {
        throw new ValidationError(DOCUMENT_COPY.NO_FILES);
      }

      if (targetFile.size === 0) {
        throw new ValidationError(DOCUMENT_COPY.EMPTY_FILE);
      }

      if (targetFile.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
        throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
      }

      const bytes = new Uint8Array(await targetFile.arrayBuffer());
      const result = await dependencies.documentService.checkDuplicate({
        buffer: bytes,
      });

      return jsonSuccess(context, result, 200);
    }

    throw new ValidationError(
      "Permintaan harus menggunakan format application/json atau multipart/form-data",
    );
  };
}
