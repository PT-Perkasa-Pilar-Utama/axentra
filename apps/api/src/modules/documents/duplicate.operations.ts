import crypto from "node:crypto";
import { DOCUMENT_COPY, type CheckDuplicateResponse } from "@axentra/shared";
import { ValidationError } from "../../http/errors";
import type { IDocumentRepository } from "./documents.repository";
import type { IDocumentContentHashRepository } from "./duplicate.repository";

export type CheckDuplicateInput = {
  contentHash?: string | undefined;
  buffer?: Uint8Array | undefined;
  algorithm?: string | undefined;
};

export type DuplicateOperationDependencies = {
  repository: IDocumentRepository;
  contentHashRepository?: IDocumentContentHashRepository | undefined;
};

export async function checkDuplicateOperation(
  dependencies: DuplicateOperationDependencies,
  input: CheckDuplicateInput,
): Promise<CheckDuplicateResponse> {
  let hash = input.contentHash;
  if (!hash && input.buffer) {
    hash = crypto.createHash("sha256").update(input.buffer).digest("hex");
  }

  if (!hash) {
    throw new ValidationError("Content hash atau file diperlukan");
  }

  let existingDocumentId: string | null = null;
  if (dependencies.contentHashRepository) {
    const record = await dependencies.contentHashRepository.findByContentHash(
      hash,
      input.algorithm,
    );
    if (record) {
      existingDocumentId = record.documentId;
    }
  }

  if (!existingDocumentId && dependencies.repository.findByContentHash) {
    const record = await dependencies.repository.findByContentHash(hash, input.algorithm);
    if (record) {
      existingDocumentId = record.documentId;
    }
  }

  if (existingDocumentId) {
    return {
      isDuplicate: true,
      existingDocumentId,
      message: DOCUMENT_COPY.DUPLICATE_WARNING,
    };
  }

  return {
    isDuplicate: false,
  };
}
