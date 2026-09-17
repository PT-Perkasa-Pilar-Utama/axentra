export type PutObjectInput = {
  key: string;
  body: Uint8Array | string;
  contentType: string;
  checksumSha256?: string;
};

export type ObjectMetadata = {
  key: string;
  contentLength: number | undefined;
  contentType: string | undefined;
  checksumSha256: string | undefined;
};

export type StorageAdapter = {
  initialize: () => Promise<void>;
  checkHealth: () => Promise<void>;
  putObject: (input: PutObjectInput) => Promise<void>;
  getObject: (key: string) => Promise<Uint8Array>;
  deleteObject: (key: string) => Promise<void>;
  headObject: (key: string) => Promise<ObjectMetadata>;
  createDownloadUrl: (key: string, expiresInSeconds?: number) => Promise<string>;
  close: () => Promise<void>;
};

export function validateObjectKey(key: string): string {
  const normalized = key.trim();
  if (normalized.length === 0 || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error("Object key must be relative and may not contain traversal segments");
  }
  return normalized;
}
