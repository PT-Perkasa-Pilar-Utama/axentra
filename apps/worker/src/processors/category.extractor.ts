import { extractDocumentBodyText } from "./document-text.extractor";

export type ExtractedCategory = {
  name: string;
  slug: string;
};

export type CategoryDefinition = {
  name: string;
  slug: string;
  keywords: ReadonlyArray<string>;
};

export const STANDARD_CATEGORY_DEFINITIONS: ReadonlyArray<CategoryDefinition> = [
  {
    name: "Reporting",
    slug: "reporting",
    keywords: ["reporting", "laporan", "report", "reports"],
  },
  {
    name: "Contract",
    slug: "contract",
    keywords: ["contract", "kontrak", "perjanjian", "agreement"],
  },
  {
    name: "Finance",
    slug: "finance",
    keywords: ["finance", "keuangan", "financial", "kas"],
  },
  {
    name: "Legal",
    slug: "legal",
    keywords: ["legal", "hukum", "regulasi", "regulation"],
  },
  {
    name: "Strategy",
    slug: "strategy",
    keywords: ["strategy", "strategi", "strategic", "rencana"],
  },
  {
    name: "HR",
    slug: "hr",
    keywords: ["hr", "sdm", "human resources", "personalia", "kepegawaian"],
  },
  {
    name: "Tax",
    slug: "tax",
    keywords: ["tax", "pajak", "perpajakan"],
  },
  {
    name: "Audit",
    slug: "audit",
    keywords: ["audit", "auditing", "pemeriksaan"],
  },
  {
    name: "Budget",
    slug: "budget",
    keywords: ["budget", "anggaran", "budgeting"],
  },
  {
    name: "Operations",
    slug: "operations",
    keywords: ["operations", "operasional", "operational"],
  },
  {
    name: "Marketing",
    slug: "marketing",
    keywords: ["marketing", "pemasaran"],
  },
  {
    name: "Procurement",
    slug: "procurement",
    keywords: ["procurement", "pengadaan"],
  },
  {
    name: "Research",
    slug: "research",
    keywords: ["research", "riset", "penelitian"],
  },
  {
    name: "Invoice",
    slug: "invoice",
    keywords: ["invoice", "faktur", "tagihan"],
  },
  {
    name: "Compliance",
    slug: "compliance",
    keywords: ["compliance", "kepatuhan"],
  },
];

export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type CategoryMatchScore = {
  category: ExtractedCategory;
  count: number;
  firstIndex: number;
};

function scoreCategoriesInText(
  text: string,
  categories: ReadonlyArray<CategoryDefinition>,
): ExtractedCategory | null {
  if (!text || text.trim().length === 0) return null;

  const matches: CategoryMatchScore[] = [];

  for (const def of categories) {
    let totalCount = 0;
    let earliestIndex = Number.MAX_SAFE_INTEGER;

    for (const kw of def.keywords) {
      const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        totalCount++;
        if (match.index < earliestIndex) {
          earliestIndex = match.index;
        }
      }
    }

    if (totalCount > 0) {
      matches.push({
        category: { name: def.name, slug: def.slug },
        count: totalCount,
        firstIndex: earliestIndex,
      });
    }
  }

  if (matches.length === 0) return null;

  // Prioritize highest match count; break ties with earliest appearance in text
  matches.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.firstIndex - b.firstIndex;
  });

  const best = matches[0];
  return best ? best.category : null;
}

const dynamicCategoryDefinitions: CategoryDefinition[] = [];

/**
 * Registers an additional category definition for extraction (e.g. custom or test isolation categories).
 * Returns an unregister callback to restore the original state.
 */
export function registerCategoryDefinition(definition: CategoryDefinition): () => void {
  dynamicCategoryDefinitions.push(definition);
  return () => {
    const index = dynamicCategoryDefinitions.indexOf(definition);
    if (index !== -1) {
      dynamicCategoryDefinitions.splice(index, 1);
    }
  };
}

/**
 * Extracts a category from document content or metadata/filename fallback.
 * Priority:
 * 1. Document body text content keywords (AC-05.01, AC-05.02)
 * 2. Filename fallback if body text contains no recognized category keywords
 */
export function extractCategoryFromBuffer(
  filename: string,
  mimeType: string,
  buffer: Uint8Array,
  rawText?: string | undefined,
  existingCategories?: ReadonlyArray<{ name: string; slug: string }> | undefined,
): ExtractedCategory | null {
  // 1. Build category definitions list including any project-specific existing categories
  const definitions: CategoryDefinition[] = [
    ...STANDARD_CATEGORY_DEFINITIONS,
    ...dynamicCategoryDefinitions,
  ];

  if (existingCategories && existingCategories.length > 0) {
    for (const existing of existingCategories) {
      const alreadyDefined = definitions.some((d) => d.slug === existing.slug);
      if (!alreadyDefined) {
        definitions.push({
          name: existing.name,
          slug: existing.slug,
          keywords: [existing.name.toLowerCase(), existing.slug.replace(/-/g, " ")],
        });
      }
    }
  }

  // 2. Extract or retrieve body text
  const bodyText =
    rawText && rawText.trim().length > 0
      ? rawText
      : extractDocumentBodyText(filename, mimeType, buffer);

  // 3. Primary: Match from body text (AC-05.01, AC-05.02)
  if (bodyText.trim().length > 0) {
    const matched = scoreCategoriesInText(bodyText, definitions);
    if (matched) return matched;
  }

  // 4. Secondary: Fallback to filename tokens
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "").replace(/[-_.]+/g, " ");
  return scoreCategoriesInText(nameWithoutExt, definitions);
}
