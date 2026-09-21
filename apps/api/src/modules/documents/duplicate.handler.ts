import type { Context } from "hono";
import { checkDuplicateRequestSchema, DOCUMENT_COPY } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
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
      let formData: FormData;
      try {
        formData = await context.req.formData();
      } catch {
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
