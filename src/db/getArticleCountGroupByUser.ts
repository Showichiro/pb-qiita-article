import { DrizzleD1Database, asc, count, desc, between, gte, lte } from "@/lib";
import { schema } from "@/db";
import { ArticleCountGroupByUser } from "@/schemas";

/**
 * Config for getArticleCountGroupByUser.
 * @property {string | null} sinse Start date.
 * @property {string | null} until End date.
 * @property {"asc" | "desc"} sort Sort order. Default is "desc".
 * @example
 * ```ts
 * const config: Config = {
 *   sinse: "2024-01-01T00:00:00Z",
 *   until: "2023-01-01T00:00:00Z",
 *   sort: "asc",
 * };
 * ```
 * @example
 * ```ts
 * const config: Config = {
 *   sinse: null,
 *   until: null,
 *   sort: "asc",
 * };
 * ```
 */
export type RankingConfig = {
  sinse: string | null;
  until: string | null;
  sort?: "asc" | "desc";
};

/**
 * Get article count group by user.
 * @param db DrizzleD1Database instance.
 * @param config Config for getArticleCountGroupByUser.
 * @returns Array of ArticleCountGroupByUser.
 * @example
 * ```ts
 * const config: Config = {
 *   sinse: "2024-01-01T00:00:00Z",
 *   until: "2023-01-01T00:00:00Z",
 *   sort: "asc",
 * };
 * const results = await getArticleCountGroupByUser(db, config);
 * ```
 */
export const getArticleCountGroupByUser = async (
  db: DrizzleD1Database<typeof schema>,
  { sinse, until, sort = "desc" }: RankingConfig
): Promise<Array<ArticleCountGroupByUser>> => {
  const results = await db
    .select({
      count: count(schema.articles.id),
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
      sort === "asc" ? asc(fileds.count) : desc(fileds.count),
    ])
    .all();
  return results.map(({ createdAt, ...rest }) => ({ ...rest }));
};
