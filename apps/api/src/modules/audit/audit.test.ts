import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  downloadAuditListResponseSchema,
  type DownloadAuditEvent,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { InMemoryAuditRepository } from "./audit.repository";
import { createAuditService } from "./audit.service";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "valid-head-token") {
      return {
        id: "11111111-1111-4111-8111-111111111111",
        email: "head@axentra.test",
        role: "head_of_team",
        name: "Budi Santoso",
      };
    }
    if (token === "valid-member-token") {
      return {
        id: "22222222-2222-4222-8222-222222222222",
        email: "member@axentra.test",
        role: "member_team",
        name: "Rina Pratama",
      };
    }
    if (token === "valid-admin-token") {
      return {
        id: "33333333-3333-4333-8333-333333333333",
        email: "admin@axentra.test",
        role: "admin",
        name: "Admin Sistem",
      };
    }
    return null;
  },
};

function createTestAuditApp(
  events: ReadonlyArray<DownloadAuditEvent> = [],
): ReturnType<typeof createApp> {
  const repository = new InMemoryAuditRepository();
  for (const event of events) {
    repository.addEvent(event);
  }
  return createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    auditService: createAuditService(repository),
  });
}

describe("GET /api/v1/audit/downloads - Task BE-S4-02 (AC-12.01)", () => {
  const sampleEvents: ReadonlyArray<DownloadAuditEvent> = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      userId: "22222222-2222-4222-8222-222222222222",
      userName: "Rina Pratama",
      userEmail: "member@axentra.test",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      documentName: "Laporan-Q1-2026.pdf",
      downloadedAt: "2026-04-17T08:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      userId: "11111111-1111-4111-8111-111111111111",
      userName: "Budi Santoso",
      userEmail: "head@axentra.test",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      documentName: "SOP-Keamanan-2026.pdf",
      downloadedAt: "2026-04-17T09:15:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      userId: null,
      userName: "Mantan Anggota",
      userEmail: "former@axentra.test",
      documentId: null,
      documentName: "Kontrak-Vendor-Arsip.docx",
      downloadedAt: "2026-04-17T09:15:00.000Z",
    },
  ];

  it("returns 200 for head_of_team with user, documentName, and downloadedAt ordered newest first", async () => {
    const app = createTestAuditApp(sampleEvents);
    const res = await app.request("/api/v1/audit/downloads", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const body = downloadAuditListResponseSchema.parse(await res.json());
    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 3,
    });
    expect(body.data.map((event) => event.id)).toEqual([
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
    ]);
    expect(body.data[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000003",
      userId: "11111111-1111-4111-8111-111111111111",
      userName: "Budi Santoso",
      userEmail: "head@axentra.test",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      documentName: "SOP-Keamanan-2026.pdf",
      downloadedAt: "2026-04-17T09:15:00.000Z",
    });
    expect(body.data[1]?.userName).toBe("Mantan Anggota");
    expect(body.data[1]?.documentName).toBe("Kontrak-Vendor-Arsip.docx");
  });

  it("returns 200 with an empty list and zero total when no download events exist", async () => {
    const app = createTestAuditApp([]);
    const res = await app.request("/api/v1/audit/downloads", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const body = downloadAuditListResponseSchema.parse(await res.json());
    expect(body.data).toEqual([]);
    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 0,
    });
  });

  it("supports custom page and limit query parameters", async () => {
    const app = createTestAuditApp(sampleEvents);
    const res = await app.request("/api/v1/audit/downloads?page=2&limit=2", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const body = downloadAuditListResponseSchema.parse(await res.json());
    expect(body.meta).toEqual({
      page: 2,
      limit: 2,
      total: 3,
    });
    expect(body.data.map((event) => event.id)).toEqual(["00000000-0000-4000-8000-000000000001"]);
  });

  it("returns 400 VALIDATION_ERROR for invalid page or limit query values", async () => {
    const app = createTestAuditApp(sampleEvents);
    for (const query of [
      "page=0",
      "page=-2",
      "page=1001",
      "page=abc",
      "limit=0",
      "limit=101",
      "limit=1.5",
    ]) {
      const res = await app.request(`/api/v1/audit/downloads?${query}`, {
        method: "GET",
        headers: {
          Authorization: "Bearer valid-head-token",
        },
      });
      expect(res.status).toBe(400);
      const body = apiErrorSchema.parse(await res.json());
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Data tidak valid");
    }
  });

  it("returns 401 UNAUTHORIZED when Authorization header is missing or invalid", async () => {
    const app = createTestAuditApp(sampleEvents);

    const missingHeaderRes = await app.request("/api/v1/audit/downloads", {
      method: "GET",
    });
    expect(missingHeaderRes.status).toBe(401);
    const missingBody = apiErrorSchema.parse(await missingHeaderRes.json());
    expect(missingBody.error.code).toBe("UNAUTHORIZED");

    const invalidTokenRes = await app.request("/api/v1/audit/downloads", {
      method: "GET",
      headers: {
        Authorization: "Bearer invalid-token",
      },
    });
    expect(invalidTokenRes.status).toBe(401);
    const invalidBody = apiErrorSchema.parse(await invalidTokenRes.json());
    expect(invalidBody.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 FORBIDDEN for member_team and admin roles in BE-S4-02", async () => {
    const app = createTestAuditApp(sampleEvents);

    for (const token of ["valid-member-token", "valid-admin-token"]) {
      const res = await app.request("/api/v1/audit/downloads", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(res.status).toBe(403);
      const body = apiErrorSchema.parse(await res.json());
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe("Anda tidak memiliki akses untuk tindakan ini");
    }
  });
});
