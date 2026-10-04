import { sql } from "drizzle-orm";
import { asc, and, desc, type DrizzleD1Database, eq, sum } from "@/lib";
import { assertGenerationPublished } from "./dataGenerations";
import type { LikesCountSchema } from "@/schemas";
import { type RankingConfig, schema } from "@/db";

/**
 * Get likes count group by user
 * @param db
 * @param config
 * @returns Array<LikesCountSchema>
 * @example
 * getLikesCountGroupByUser(db, {
 *   since: "2024-01-01T00:00:00Z",
 *   until: null,
 *   sort: "asc",
 * });
 */
export const getLikesCountGroupByUser = async (
  db: DrizzleD1Database<typeof schema>,
  generationId: string,
  { since, until, sort = "desc" }: RankingConfig,
): Promise<Array<LikesCountSchema>> => {
  await assertGenerationPublished(db, generationId);
  const results = await db
    .select({
      totalLikesCount: sum(schema.generationArticles.likesCount),
      userId: schema.generationArticles.userId,
      userName: schema.generationArticles.userName,
    })
    .from(schema.generationArticles)
    .where(
      and(
        eq(schema.generationArticles.generationId, generationId),
        since && until
          ? sql`julianday(${schema.generationArticles.createdAt}) between julianday(${since}) and julianday(${until})`
          : since
            ? sql`julianday(${schema.generationArticles.createdAt}) >= julianday(${since})`
            : until
              ? sql`julianday(${schema.generationArticles.createdAt}) <= julianday(${until})`
              : undefined,
      ),
    )
    .groupBy((fields) => fields.userId)
    .orderBy((fields) => [
      sort === "asc"
        ? asc(fields.totalLikesCount)
        : desc(fields.totalLikesCount),
    ])
    .all();
  return results;
};
