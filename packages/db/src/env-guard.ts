import { getVerifiedDatabaseConnection } from "./client";

const ALLOWED_LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "postgres",
]);

function extractHosts(hostStr: string): string[] {
  return hostStr.split(",").map((entry) => {
    const trimmed = entry.trim();
    if (trimmed.startsWith("[")) {
      const closeIdx = trimmed.indexOf("]");
      if (closeIdx !== -1) {
        return trimmed.slice(1, closeIdx).toLowerCase();
      }
    }
    return trimmed.split(":")[0]?.toLowerCase() ?? "";
  });
}

export function assertAllowedEnvironment(env: string | undefined): void {
  const normalized = env?.trim().toLowerCase();
  if (normalized === "production") {
    throw new Error("Database seeder must not run in production environment");
  }
  if (normalized !== "development" && normalized !== "test") {
    throw new Error(
      `Database seeder is restricted to development or test environments, got: ${env ?? "undefined"}`,
    );
  }
}

export function assertAllowedDatabaseUrl(databaseUrl: string | undefined): void {
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required to run seed");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid database URL: failed to parse URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Invalid database URL: protocol must be postgres: or postgresql:");
  }

  if (parsed.searchParams.has("host")) {
    throw new Error("Database seeder does not allow host query parameter");
  }

  const hosts = extractHosts(parsed.host);
  if (hosts.length === 0 || hosts.some((h) => !h)) {
    throw new Error("Invalid database URL: hostname is missing");
  }

  for (const host of hosts) {
    if (!ALLOWED_LOCAL_HOSTS.has(host)) {
      throw new Error(
        `Database seeder is not allowed to run against remote/production database host: ${host}`,
      );
    }
  }

  if (hosts.length > 1) {
    throw new Error("Database seeder does not allow multi-host database URLs");
  }
}

export function assertAllowedDatabaseClient(client: unknown): void {
  if (client === null || typeof client !== "object") {
    throw new Error(
      "Database seeder rejects execution with invalid client: client must be an object",
    );
  }

  const candidate = client as { sql?: unknown; db?: unknown };
  if (
    !("sql" in candidate) ||
    candidate.sql === null ||
    typeof candidate.sql !== "function" ||
    !("options" in candidate.sql)
  ) {
    throw new Error(
      "Database seeder rejects execution with db-only or unverified client: client must have verified host connection",
    );
  }

  const sqlOptions = (candidate.sql as { options?: { host?: string | string[] } }).options;
  const rawHost = sqlOptions?.host;
  let hosts: string[] = [];
  if (Array.isArray(rawHost)) {
    hosts = rawHost;
  } else if (typeof rawHost === "string") {
    hosts = [rawHost];
  }

  if (hosts.length === 0 || hosts.some((h) => !h)) {
    throw new Error(
      "Database seeder rejects execution: database client host information is missing",
    );
  }

  for (const host of hosts) {
    if (!ALLOWED_LOCAL_HOSTS.has(host.toLowerCase())) {
      throw new Error(
        `Database seeder is not allowed to run against remote/production database host: ${host}`,
      );
    }
  }

  if (hosts.length > 1) {
    throw new Error("Database seeder does not allow multi-host database URLs");
  }

  if (!("db" in candidate) || candidate.db === null || typeof candidate.db !== "object") {
    throw new Error(
      "Database seeder rejects execution with invalid client: client must have a db instance",
    );
  }

  const session =
    (candidate.db as { session?: { client?: unknown } }).session ??
    (candidate.db as { _?: { session?: { client?: unknown } } })._?.session;
  if (!session || !session.client || session.client !== candidate.sql) {
    throw new Error("Database seeder rejects execution: database client connection mismatch");
  }

  const verifiedConnection = getVerifiedDatabaseConnection(candidate.db);
  if (!verifiedConnection || verifiedConnection.sql !== candidate.sql) {
    throw new Error(
      "Database seeder rejects execution with db-only or unverified client: client must have verified host connection",
    );
  }

  const verifiedHosts = verifiedConnection.hosts;
  if (verifiedHosts.length === 0 || verifiedHosts.some((host) => !host)) {
    throw new Error(
      "Database seeder rejects execution: database client host information is missing",
    );
  }

  for (const host of verifiedHosts) {
    if (!ALLOWED_LOCAL_HOSTS.has(host)) {
      throw new Error(
        `Database seeder is not allowed to run against remote/production database host: ${host}`,
      );
    }
  }

  if (verifiedHosts.length > 1) {
    throw new Error("Database seeder does not allow multi-host database URLs");
  }
}
