import { asc, between, desc, type DrizzleD1Database, gte, lte, sum } from "@/lib";
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
  { since, until, sort = "desc" }: RankingConfig,
): Promise<Array<LikesCountSchema>> => {
  const results = await db
    .select({
      totalLikesCount: sum(schema.articles.likesCount),
      userId: schema.articles.userId,
      userName: schema.articles.userName,
      createdAt: schema.articles.createdAt,
    })
    .from(schema.articles)
    .where(
      !since && !until
        ? undefined
        : (fileds) => {
            if (since && until) {
              return between(fileds.createdAt, since, until);
            }
            if (since) {
              return gte(fileds.createdAt, since);
            }
            if (until) {
              return lte(fileds.createdAt, until);
            }
          },
    )
    .groupBy((fileds) => fileds.userId)
    .orderBy((fileds) => [
      sort === "asc"
        ? asc(fileds.totalLikesCount)
        : desc(fileds.totalLikesCount),
    ])
    .all();
  return results.map(({ createdAt, ...rest }) => ({
    ...rest,
  }));
};
