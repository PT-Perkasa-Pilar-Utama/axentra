import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { ApiErrorEnvelope, ApiSuccessEnvelope, CategorySummary } from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { InMemoryCategoriesRepository } from "./categories.repository";
import { createCategoriesService } from "./categories.service";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "valid-member-token") {
      return {
        id: "usr-member-1",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    if (token === "valid-head-token") {
      return {
        id: "usr-head-1",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head of Team User",
      };
    }
    if (token === "unauthorized-role-token") {
      return {
        id: "usr-other-1",
        email: "other@axentra.local",
        role: "guest" as unknown as "member_team",
        name: "Guest User",
      };
    }
    return null;
  },
};

describe("GET /api/v1/categories - Task BE-S2-04 (AC-05.01)", () => {
  const repository = new InMemoryCategoriesRepository();
  const categoriesService = createCategoriesService(repository);

  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    categoriesService,
  });

  const cat1: CategorySummary = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Reporting",
    slug: "reporting",
    downloadEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const cat2: CategorySummary = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Contract",
    slug: "contract",
    downloadEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  repository.categories.set(cat1.id, cat1);
  repository.categories.set(cat2.id, cat2);

  it("returns 200 with category list for member_team per AC-05.01", async () => {
    const res = await app.request("/api/v1/categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessEnvelope<ReadonlyArray<CategorySummary>>;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.data.map((c) => c.name)).toEqual(["Contract", "Reporting"]);
    expect(body.data[0]?.downloadEnabled).toBe(false);
  });

  it("returns 200 with category list for head_of_team", async () => {
    const res = await app.request("/api/v1/categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessEnvelope<ReadonlyArray<CategorySummary>>;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.request("/api/v1/categories", {
      method: "GET",
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when user has an unauthorized role", async () => {
    const res = await app.request("/api/v1/categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer unauthorized-role-token",
      },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("respects custom limit query parameter (Finding F8)", async () => {
    const res = await app.request("/api/v1/categories?limit=1", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessEnvelope<ReadonlyArray<CategorySummary>>;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.name).toBe("Contract");
  });

  it("returns 400 VALIDATION_ERROR when limit is less than 1 (Finding F8)", async () => {
    const res = await app.request("/api/v1/categories?limit=0", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when limit exceeds CATEGORIES_MAX_LIMIT (100) (Finding F8)", async () => {
    const res = await app.request("/api/v1/categories?limit=101", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when limit is not a number (Finding F8)", async () => {
    const res = await app.request("/api/v1/categories?limit=not-a-number", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
