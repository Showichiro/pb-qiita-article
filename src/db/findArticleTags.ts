import type { DrizzleD1Database } from "@/lib";
import { asc } from "drizzle-orm";
import * as schema from "./schema";

/** Return sorted distinct exact tag names for article search options. */
export const findArticleTags = async (
  db: DrizzleD1Database<typeof schema>,
): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ name: schema.tags.name })
    .from(schema.tags)
    .orderBy(asc(schema.tags.name));
  return rows.map(({ name }) => name);
};
