import type { DrizzleD1Database } from "@/lib";
import { asc, eq } from "drizzle-orm";
import * as schema from "./schema";

/** Return sorted distinct exact tag names for article search options. */
export const findArticleTags = async (
  db: DrizzleD1Database<typeof schema>,
  generationId: string,
): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ name: schema.generationTags.name })
    .from(schema.generationTags)
    .where(eq(schema.generationTags.generationId, generationId))
    .orderBy(asc(schema.generationTags.name));
  return rows.map(({ name }) => name);
};
