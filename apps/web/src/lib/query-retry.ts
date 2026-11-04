import { ApiClientError } from "./api-client.errors";

type RetryPredicate = (failureCount: number, error: unknown) => boolean;

export function createTransientRetry(maxRetries: number): RetryPredicate {
  return (failureCount, error) => {
    const isClientError =
      error instanceof ApiClientError && error.status >= 400 && error.status < 500;
    return !isClientError && failureCount < maxRetries;
  };
}
