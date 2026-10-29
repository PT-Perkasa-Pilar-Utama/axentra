import { createHash, randomBytes } from "node:crypto";

// High-entropy opaque tokens. Only their SHA-256 hashes are stored server-side.
export function generateAccessToken(): string {
  return `ax_${randomBytes(32).toString("base64url")}`;
}

export function generateRefreshToken(): string {
  return `ax_rt_${randomBytes(32).toString("base64url")}`;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
