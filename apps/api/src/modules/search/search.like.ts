import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

// Inside a LIKE pattern, % and _ are wildcards and the backslash is the escape character.
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

export function escapeLikePattern(value: string): string {
  return value.replace(LIKE_SPECIAL_CHARACTERS, (character) => `\\${character}`);
}

export function containsLikePattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

// Case-insensitive "contains" match for user input. ESCAPE '\' keeps %, _ and \ literal.
export function ilikeContains(column: SQLWrapper, value: string): SQL {
  return sql`${column} ilike ${containsLikePattern(value)} escape '\\'`;
}
