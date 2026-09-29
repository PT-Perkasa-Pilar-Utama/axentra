import type { ProcessingStatus } from "@axentra/shared";

export type MockTag = { id: string; name: string };

export type MockDocument = {
  id: string;
  filename: string;
  processingStatus: ProcessingStatus;
  createdAt: string;
  sizeBytes: number;
  category: string;
  tags: MockTag[];
};

export const MOCK_TOP_TAGS = [
  { id: "tag-01", name: "Strategy", documentCount: 14 },
  { id: "tag-02", name: "Analyst", documentCount: 9 },
  { id: "tag-03", name: "Data Science", documentCount: 7 },
  { id: "tag-04", name: "Design", documentCount: 6 },
  { id: "tag-05", name: "Marketing", documentCount: 5 },
  { id: "tag-06", name: "Development", documentCount: 4 },
  { id: "tag-07", name: "Testing", documentCount: 3 },
];

export const MOCK_DOCUMENTS: MockDocument[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    filename: "DocumentCustomer",
    processingStatus: "completed",
    createdAt: "2025-12-16T00:00:00.000Z",
    sizeBytes: 2 * 1024 * 1024,
    category: "Reporting",
    tags: [
      { id: "tag-01", name: "Strategy" },
      { id: "tag-08", name: "AI" },
      { id: "tag-03", name: "Data Science" },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    filename: "ProjectAnalysis",
    processingStatus: "completed",
    createdAt: "2026-01-22T00:00:00.000Z",
    sizeBytes: 3.5 * 1024 * 1024,
    category: "Feedback",
    tags: [
      { id: "tag-04", name: "Design" },
      { id: "tag-09", name: "UX" },
      { id: "tag-10", name: "User Research" },
    ],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    filename: "MarketResearch",
    processingStatus: "completed",
    createdAt: "2026-03-30T00:00:00.000Z",
    sizeBytes: 1.8 * 1024 * 1024,
    category: "Insights",
    tags: [
      { id: "tag-05", name: "Marketing" },
      { id: "tag-11", name: "SEO" },
      { id: "tag-12", name: "Competitor Analysis" },
    ],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    filename: "ProductLaunch",
    processingStatus: "processing",
    createdAt: "2026-05-15T00:00:00.000Z",
    sizeBytes: 5 * 1024 * 1024,
    category: "Launch",
    tags: [
      { id: "tag-06", name: "Development" },
      { id: "tag-13", name: "Frontend" },
      { id: "tag-14", name: "Feature Implementation" },
    ],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    filename: "BetaTesting",
    processingStatus: "queued",
    createdAt: "2026-07-01T00:00:00.000Z",
    sizeBytes: 10 * 1024 * 1024,
    category: "Refine",
    tags: [
      { id: "tag-07", name: "Testing" },
      { id: "tag-15", name: "Backend" },
      { id: "tag-16", name: "Bug Fixes" },
    ],
  },
];
