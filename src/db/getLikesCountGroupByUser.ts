import { asc, between, desc, DrizzleD1Database, gte, lte, sum } from "@/lib";
import { LikesCountSchema } from "@/schemas";
import { schema } from "@/db";

type Config = {
  sinse: string | null;
  until: string | null;
  sort?: "asc" | "desc";
};

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
  { sinse, until, sort = "desc" }: Config
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
      !sinse && !until
        ? undefined
        : (fileds) => {
            if (sinse && until) {
              return between(fileds.createdAt, sinse, until);
            }
            if (sinse) {
              return gte(fileds.createdAt, sinse);
            }
            if (until) {
              return lte(fileds.createdAt, until);
            }
          }
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
