import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  topTagsQuerySchema,
  topTagsResponseSchema,
  type TopTag,
  type TopTagsQuery,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import type { TopTagsRepository } from "./tags.repository";
import { createTopTagsService } from "./tags.service";
import type { TopTagsService } from "./tags.service";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const memberId = "11111111-1111-4111-8111-111111111111";
const secondDocumentId = "22222222-2222-4222-8222-222222222222";
const freshTag: TopTag = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "fresh",
  documentCount: 1,
};
const anotherFreshTag: TopTag = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "fresh-2",
  documentCount: 1,
};
const thirdFreshTag: TopTag = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "fresh-3",
  documentCount: 1,
};
const popularTags: ReadonlyArray<TopTag> = Array.from({ length: 10 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: `popular-${index + 1}`,
  documentCount: 20 - index,
}));

const tokenVerifier: TokenVerifier = {
  verifyToken(token) {
    if (token === "member-token") {
      return {
        id: memberId,
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    if (token === "head-token") {
      return {
        id: secondDocumentId,
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head User",
      };
    }
    return null;
  },
};

function appWith(service: TopTagsService) {
  return createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    topTagsService: service,
  });
}

function serviceReturning(tags: ReadonlyArray<TopTag>): TopTagsService {
  return { listTopTags: async () => tags };
}

function repositoryWithTags(
  popular: ReadonlyArray<TopTag>,
  recent: ReadonlyArray<TopTag>,
): TopTagsRepository {
  return {
    listTopTags: async () => popular,
    listMostRecentDocumentTags: async () => recent,
  };
}

describe("GET /api/v1/tags/top", () => {
  it("returns the bounded shared response for member_team", async () => {
    const response = await appWith(serviceReturning([freshTag])).request(
      "/api/v1/tags/top?context=dashboard",
      { headers: { authorization: "Bearer member-token" } },
    );

    expect(response.status).toBe(200);
    expect(topTagsResponseSchema.parse(await response.json())).toEqual({
      success: true,
      data: [freshTag],
    });
  });

  it("allows head_of_team", async () => {
    const response = await appWith(serviceReturning([])).request(
      "/api/v1/tags/top?context=dashboard",
      { headers: { authorization: "Bearer head-token" } },
    );

    expect(response.status).toBe(200);
  });

  it("returns 401 for missing or rejected bearer tokens", async () => {
    const app = appWith(serviceReturning([]));
    const missing = await app.request("/api/v1/tags/top?context=dashboard");
    const rejected = await app.request("/api/v1/tags/top?context=dashboard", {
      headers: { authorization: "Bearer forged-token" },
    });

    expect(missing.status).toBe(401);
    expect(rejected.status).toBe(401);
    expect(apiErrorSchema.parse(await rejected.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for an invalid context", async () => {
    const app = appWith(serviceReturning([]));
    const invalidContext = await app.request("/api/v1/tags/top?context=other", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(invalidContext.status).toBe(400);
    expect(apiErrorSchema.parse(await invalidContext.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when the limit is below or above the supported range", async () => {
    const app = appWith(serviceReturning([]));
    const limitTooSmall = await app.request("/api/v1/tags/top?context=dashboard&limit=2", {
      headers: { authorization: "Bearer member-token" },
    });
    const limitTooLarge = await app.request("/api/v1/tags/top?context=dashboard&limit=21", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(limitTooSmall.status).toBe(400);
    expect(limitTooLarge.status).toBe(400);
    expect(apiErrorSchema.parse(await limitTooLarge.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("forwards repeated search document IDs using the shared query contract", async () => {
    let receivedQuery: TopTagsQuery | undefined;
    const service: TopTagsService = {
      async listTopTags(query) {
        receivedQuery = query;
        return [];
      },
    };
    const response = await appWith(service).request(
      `/api/v1/tags/top?context=search&documentIds=${memberId}&documentIds=${secondDocumentId}`,
      { headers: { authorization: "Bearer member-token" } },
    );

    expect(response.status).toBe(200);
    expect(receivedQuery).toEqual({
      context: "search",
      limit: 10,
      documentIds: [memberId, secondDocumentId],
    });
  });

  it("rejects document IDs in dashboard context", async () => {
    const app = appWith(serviceReturning([]));
    const dashboardIds = await app.request(
      `/api/v1/tags/top?context=dashboard&documentIds=${memberId}`,
      { headers: { authorization: "Bearer member-token" } },
    );
    expect(dashboardIds.status).toBe(400);
  });

  it("rejects malformed document IDs in search context", async () => {
    const response = await appWith(serviceReturning([])).request(
      "/api/v1/tags/top?context=search&documentIds=not-a-uuid",
      { headers: { authorization: "Bearer member-token" } },
    );

    expect(response.status).toBe(400);
  });
});

describe("Top Tags service", () => {
  it("includes the latest document's low-frequency tag before filling with popular tags", async () => {
    const service = createTopTagsService(repositoryWithTags(popularTags, [freshTag]));
    const query = topTagsQuerySchema.parse({ context: "dashboard", limit: 10 });

    const tags = await service.listTopTags(query);

    expect(tags).toHaveLength(10);
    expect(tags[0]).toEqual(freshTag);
    expect(tags.slice(1)).toEqual(popularTags.slice(0, 9));
  });

  it("returns all three tags from the latest document at the minimum limit", async () => {
    const recentTags = [freshTag, anotherFreshTag, thirdFreshTag];
    const service = createTopTagsService(repositoryWithTags(popularTags, recentTags));
    const query = topTagsQuerySchema.parse({ context: "dashboard", limit: 3 });

    expect(await service.listTopTags(query)).toEqual(recentTags);
  });

  it("deduplicates recent tags already present in the popular ranking", async () => {
    const overlappingTag = popularTags[0];
    const service = createTopTagsService(
      repositoryWithTags(popularTags, overlappingTag === undefined ? [] : [overlappingTag]),
    );
    const query = topTagsQuerySchema.parse({ context: "dashboard", limit: 10 });

    const tags = await service.listTopTags(query);

    expect(tags).toHaveLength(10);
    expect(tags.filter((tag) => tag.id === overlappingTag?.id)).toHaveLength(1);
    expect(tags[0]).toEqual(overlappingTag);
  });

  it("returns an empty list without querying the repository for an empty search page", async () => {
    let repositoryCalled = false;
    const repository: TopTagsRepository = {
      async listTopTags() {
        repositoryCalled = true;
        return [];
      },
      async listMostRecentDocumentTags() {
        repositoryCalled = true;
        return [];
      },
    };
    const service = createTopTagsService(repository);
    const query = topTagsQuerySchema.parse({ context: "search" });

    expect(await service.listTopTags(query)).toEqual([]);
    expect(repositoryCalled).toBe(false);
  });
});
