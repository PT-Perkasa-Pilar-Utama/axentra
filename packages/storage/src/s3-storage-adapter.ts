import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfig } from "@axentra/config";
import type { ObjectMetadata, PutObjectInput, StorageAdapter } from "./storage";
import { validateObjectKey } from "./storage";

const defaultDownloadTtlSeconds = 300;
const minimumDownloadTtlSeconds = 60;
const maximumDownloadTtlSeconds = 900;

function isMissingBucket(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchBucket" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export function createS3StorageAdapter(configuration: StorageConfig): StorageAdapter {
  const clientConfiguration: S3ClientConfig = {
    region: configuration.S3_REGION,
    forcePathStyle: configuration.S3_FORCE_PATH_STYLE,
  };
  if (configuration.S3_ENDPOINT !== undefined) {
    clientConfiguration.endpoint = configuration.S3_ENDPOINT;
  }
  if (
    configuration.S3_ACCESS_KEY_ID !== undefined &&
    configuration.S3_SECRET_ACCESS_KEY !== undefined
  ) {
    clientConfiguration.credentials = {
      accessKeyId: configuration.S3_ACCESS_KEY_ID,
      secretAccessKey: configuration.S3_SECRET_ACCESS_KEY,
    };
  }

  const client = new S3Client(clientConfiguration);
  const bucket = configuration.S3_BUCKET;

  async function checkHealth(): Promise<void> {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  }

  async function initialize(): Promise<void> {
    try {
      await checkHealth();
    } catch (error) {
      if (configuration.S3_PROVIDER !== "minio" || !isMissingBucket(error)) throw error;
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }

  function normalizeChecksumSha256(checksum: string | undefined): string | undefined {
    if (checksum === undefined) return undefined;
    if (/^[0-9a-fA-F]{64}$/.test(checksum)) {
      return Buffer.from(checksum, "hex").toString("base64");
    }
    return checksum;
  }

  async function putObject(input: PutObjectInput): Promise<void> {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: validateObjectKey(input.key),
        Body: input.body,
        ContentType: input.contentType,
        ChecksumSHA256: normalizeChecksumSha256(input.checksumSha256),
      }),
    );
  }

  async function getObject(key: string): Promise<Uint8Array> {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: validateObjectKey(key) }),
    );
    if (response.Body === undefined) throw new Error("Storage object body is unavailable");
    return response.Body.transformToByteArray();
  }

  async function deleteObject(key: string): Promise<void> {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: validateObjectKey(key) }));
  }

  async function headObject(key: string): Promise<ObjectMetadata> {
    const normalizedKey = validateObjectKey(key);
    const response = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: normalizedKey }),
    );
    return {
      key: normalizedKey,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      checksumSha256: response.ChecksumSHA256,
    };
  }

  async function createDownloadUrl(
    key: string,
    expiresInSeconds = defaultDownloadTtlSeconds,
  ): Promise<string> {
    if (
      expiresInSeconds < minimumDownloadTtlSeconds ||
      expiresInSeconds > maximumDownloadTtlSeconds
    ) {
      throw new Error(
        `Signed URL expiry must be between ${minimumDownloadTtlSeconds} and ${maximumDownloadTtlSeconds} seconds`,
      );
    }
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: validateObjectKey(key) }),
      { expiresIn: expiresInSeconds },
    );
  }

  async function close(): Promise<void> {
    client.destroy();
  }

  return {
    initialize,
    checkHealth,
    putObject,
    getObject,
    deleteObject,
    headObject,
    createDownloadUrl,
    close,
  };
}
