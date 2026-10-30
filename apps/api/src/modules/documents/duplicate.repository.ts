import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentContentHashes } from "@axentra/db";

export function computeSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type DocumentContentHashRecord = {
  id: string;
  documentId: string;
  hashAlgorithm: string;
  contentHash: string;
  createdAt: Date;
};

export type SaveContentHashInput = {
  documentId: string;
  contentHash: string;
  hashAlgorithm?: string | undefined;
};

export type IDocumentContentHashRepository = {
  findExistingHashes: (hashes: ReadonlyArray<string>, algorithm?: string) => Promise<Set<string>>;
  findByContentHash: (
    contentHash: string,
    algorithm?: string,
  ) => Promise<DocumentContentHashRecord | null>;
  saveContentHash: (data: SaveContentHashInput) => Promise<DocumentContentHashRecord>;
};

export class DrizzleDocumentContentHashRepository implements IDocumentContentHashRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findExistingHashes(
    hashes: ReadonlyArray<string>,
    algorithm = "sha256",
  ): Promise<Set<string>> {
    if (hashes.length === 0) {
      return new Set<string>();
    }

    const uniqueHashes = [...new Set(hashes)];
    const rows = await this.db
      .select({ contentHash: documentContentHashes.contentHash })
      .from(documentContentHashes)
      .where(
        and(
          eq(documentContentHashes.hashAlgorithm, algorithm),
          inArray(documentContentHashes.contentHash, uniqueHashes),
        ),
      );

    return new Set(rows.map((row) => row.contentHash));
  }

  public async findByContentHash(
    contentHash: string,
    algorithm = "sha256",
  ): Promise<DocumentContentHashRecord | null> {
    const rows = await this.db
      .select({
        id: documentContentHashes.id,
        documentId: documentContentHashes.documentId,
        hashAlgorithm: documentContentHashes.hashAlgorithm,
        contentHash: documentContentHashes.contentHash,
        createdAt: documentContentHashes.createdAt,
      })
      .from(documentContentHashes)
      .where(
        and(
          eq(documentContentHashes.hashAlgorithm, algorithm),
          eq(documentContentHashes.contentHash, contentHash),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  public async saveContentHash(data: SaveContentHashInput): Promise<DocumentContentHashRecord> {
    const algorithm = data.hashAlgorithm ?? "sha256";
    const [saved] = await this.db
      .insert(documentContentHashes)
      .values({
        documentId: data.documentId,
        contentHash: data.contentHash,
        hashAlgorithm: algorithm,
      })
      .returning({
        id: documentContentHashes.id,
        documentId: documentContentHashes.documentId,
        hashAlgorithm: documentContentHashes.hashAlgorithm,
        contentHash: documentContentHashes.contentHash,
        createdAt: documentContentHashes.createdAt,
      });

    if (!saved) {
      throw new Error("Gagal menyimpan hash konten dokumen");
    }

    return saved;
  }
}

export class InMemoryDocumentContentHashRepository implements IDocumentContentHashRepository {
  private readonly hashes = new Map<string, DocumentContentHashRecord>();

  public addHash(record: DocumentContentHashRecord): void {
    const key = `${record.hashAlgorithm}:${record.contentHash}`;
    this.hashes.set(key, record);
  }

  public async findExistingHashes(
    hashes: ReadonlyArray<string>,
    algorithm = "sha256",
  ): Promise<Set<string>> {
    const existing = new Set<string>();
    for (const h of hashes) {
      const key = `${algorithm}:${h}`;
      if (this.hashes.has(key)) {
        existing.add(h);
      }
    }
    return existing;
  }

  public async findByContentHash(
    contentHash: string,
    algorithm = "sha256",
  ): Promise<DocumentContentHashRecord | null> {
    const key = `${algorithm}:${contentHash}`;
    return this.hashes.get(key) ?? null;
  }

  public async saveContentHash(data: SaveContentHashInput): Promise<DocumentContentHashRecord> {
    const algorithm = data.hashAlgorithm ?? "sha256";
    const key = `${algorithm}:${data.contentHash}`;
    if (this.hashes.has(key)) {
      throw new Error("Hash konten sudah ada");
    }
    const record: DocumentContentHashRecord = {
      id: crypto.randomUUID(),
      documentId: data.documentId,
      hashAlgorithm: algorithm,
      contentHash: data.contentHash,
      createdAt: new Date(),
    };
    this.hashes.set(key, record);
    return record;
  }
}
