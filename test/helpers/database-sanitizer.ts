export const ALLOWED_LOCAL_TEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "postgres",
]);

/**
 * Strips credentials (both userinfo username:password and sensitive query parameters) from
 * a database URL for safe error messages and logging (Finding F22).
 *
 * Uses an allowlist approach to construct a safe URL containing ONLY protocol, host, port, and database name.
 *
 * Example:
 * 'postgres://axentra:secret-password@localhost:5432/axentra_test?password=query_secret&sslmode=require'
 * -> 'postgres://localhost:5432/axentra_test'
 */
export function sanitizeDatabaseUrl(databaseUrl: string): string {
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    return "<empty-url>";
  }
  try {
    const parsed = new URL(databaseUrl);
    // Strict allowlist: construct safe URL containing ONLY protocol, host, port, and database name.
    // Excludes userinfo credentials (username:password) and all query parameters (Finding F22).
    const protocol = parsed.protocol;
    const host = parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : "";
    const dbName = parsed.pathname;
    return `${protocol}//${host}${port}${dbName}`;
  } catch {
    // Fail-closed fallback (Finding F22): completely strip query string and hash,
    // then redact any remaining userinfo credentials
    const withoutQueryOrFragment = databaseUrl.split(/[?#]/)[0] ?? "";
    return sanitizeCredentials(withoutQueryOrFragment);
  }
}

/**
 * Redacts database credentials (username, password, and sensitive query parameters)
 * embedded in any connection URL or log string (Finding F22).
 */
export function sanitizeCredentials(text: string): string {
  if (typeof text !== "string") {
    return "";
  }
  // 1. Redact userinfo credentials in URLs (e.g. postgres://user:pass@host)
  let sanitized = text.replace(
    /((?:postgres|postgresql):\/\/)[^/@\s:]+(:[^/@\s]*)?@/gi,
    (_match, proto) => proto,
  );
  // 2. Redact sensitive credentials in query parameters (Finding F22: covers password, token, access_token, client_secret, etc.)
  sanitized = sanitized.replace(
    /([?&](?:[\w.-]*(?:password|pass|pwd|secret|token|key|auth|cred)[\w.-]*)=)[^&\s]+/gi,
    (_match, prefix) => `${prefix}***`,
  );
  return sanitized;
}

/**
 * Returns a safe, human-readable reason why a database URL was rejected by the disposable database guard,
 * without exposing sensitive credentials (Finding F22).
 */
export function getDisposableDatabaseRejectionReason(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);

    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return `unsupported protocol '${parsed.protocol}' (must be postgres: or postgresql:)`;
    }

    if (parsed.searchParams.has("host")) {
      return "host query parameter is forbidden";
    }

    const rawHost = parsed.hostname.toLowerCase();
    const normalizedHost = rawHost.replace(/^\[|\]$/g, "");
    if (!ALLOWED_LOCAL_TEST_HOSTS.has(normalizedHost)) {
      return `host '${normalizedHost}' is not in allowed local test hosts (${Array.from(ALLOWED_LOCAL_TEST_HOSTS).join(", ")})`;
    }

    const dbName = parsed.pathname.replace(/^\//, "");
    const lowerDbName = dbName.toLowerCase();

    if (lowerDbName.includes("prod") || lowerDbName === "production") {
      return `database name '${dbName}' indicates a production database`;
    }

    if (
      lowerDbName === "axentra" ||
      lowerDbName === "axentra_dev" ||
      lowerDbName === "development" ||
      lowerDbName === "dev"
    ) {
      return `database name '${dbName}' is a persistent development database`;
    }

    const isExplicitTestDbName =
      dbName === "test" ||
      dbName.endsWith("_test") ||
      dbName.endsWith("_disposable") ||
      dbName.startsWith("test_");

    if (!isExplicitTestDbName) {
      return `database name '${dbName}' does not have an explicit test suffix or prefix (*_test, *_disposable, test_*)`;
    }

    return "unknown validation failure";
  } catch {
    return "malformed database URL";
  }
}
