import { z } from "zod";
import { booleanFromEnvironment, optionalUrl } from "./common";

export const storageEnvironmentSchema = z
  .object({
    S3_PROVIDER: z.enum(["minio", "s3"]),
    S3_ENDPOINT: optionalUrl(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: booleanFromEnvironment(false),
  })
  .superRefine((value, context) => {
    if (value.S3_PROVIDER === "minio" && value.S3_ENDPOINT === undefined) {
      context.addIssue({
        code: "custom",
        path: ["S3_ENDPOINT"],
        message: "is required when S3_PROVIDER=minio",
      });
    }
    const oneCredentialMissing =
      (value.S3_ACCESS_KEY_ID === undefined) !== (value.S3_SECRET_ACCESS_KEY === undefined);
    if (oneCredentialMissing) {
      context.addIssue({
        code: "custom",
        path: ["S3_ACCESS_KEY_ID"],
        message: "access key and secret key must be supplied together",
      });
    }
  });

export type StorageConfig = z.infer<typeof storageEnvironmentSchema>;
