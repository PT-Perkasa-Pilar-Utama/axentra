import { loadApiConfig, type ApiConfig } from "@axentra/config";
import { createLogger, type Logger } from "@axentra/observability";
import type { AuthUser } from "@axentra/shared";

export const logger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

export type CapturedLogger = {
  logger: Logger;
  // Every log line written so far, parsed from JSON.
  entries(): unknown[];
  // The raw output, for asserting that a value never reached the log.
  output(): string;
};

// A warn-level logger that keeps its output in memory.
export function captureLogger(): CapturedLogger {
  const lines: string[] = [];
  const captured = createLogger({
    service: "axentra-api",
    environment: "test",
    version: "0.1.0",
    level: "warn",
    destination: {
      write(line: string): void {
        lines.push(line);
      },
    },
  });
  return {
    logger: captured,
    entries: () => lines.map((line): unknown => JSON.parse(line)),
    output: () => lines.join(""),
  };
}

export const TEST_WEB_ORIGIN = "https://web.axentra.internal";

export const TEST_MEMBER: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "sami@axentra.internal",
  role: "member_team",
  name: "Sami",
};

export const TEST_HEAD: AuthUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "arya@axentra.internal",
  role: "head_of_team",
  name: "Arya Isnaidi",
};

export const REFRESH_COOKIE = "axentra_refresh";

export function runtimeEnvironment(appEnv: "development" | "production"): Record<string, string> {
  return {
    APP_ENV: appEnv,
    APP_VERSION: "0.1.0",
    DATABASE_URL: "postgres://axentra:test@localhost:5432/axentra_test",
    REDIS_URL: "redis://localhost:6379/0",
    S3_PROVIDER: "minio",
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "ap-southeast-3",
    S3_BUCKET: "axentra-test",
    S3_ACCESS_KEY_ID: "local-test-user",
    S3_SECRET_ACCESS_KEY: "local-test-password",
    S3_FORCE_PATH_STYLE: "true",
    WEB_ORIGIN: TEST_WEB_ORIGIN,
  };
}

export function runtimeConfig(appEnv: "development" | "production", directory: string): ApiConfig {
  return loadApiConfig({
    ...runtimeEnvironment(appEnv),
    AUTH_LOCAL_IDENTITY_DIRECTORY: directory,
  });
}

export function encodeDirectory(records: ReadonlyArray<object>): string {
  return Buffer.from(JSON.stringify(records)).toString("base64");
}

// Returns the Set-Cookie header that sets the named cookie, or undefined when the response sets none.
export function setCookieNamed(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
}

// The value of a Set-Cookie header, without its attributes.
export function cookieValueOf(setCookie: string): string {
  const pair = setCookie.split(";")[0] ?? "";
  return pair.slice(pair.indexOf("=") + 1);
}

export function refreshCookieHeader(refreshToken: string): Record<string, string> {
  return { cookie: `${REFRESH_COOKIE}=${refreshToken}` };
}

export function jsonPost(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}
