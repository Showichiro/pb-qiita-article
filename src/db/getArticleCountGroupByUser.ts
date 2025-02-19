import {
  type DrizzleD1Database,
  asc,
  count,
  desc,
  between,
  gte,
  lte,
} from "@/lib";
import { schema } from "@/db";
import type { ArticleCountGroupByUser } from "@/schemas";

/**
 * Config for getArticleCountGroupByUser.
 * @property {string | null} since Start date.
 * @property {string | null} until End date.
 * @property {"asc" | "desc"} sort Sort order. Default is "desc".
 * @example
 * ```ts
 * const config: Config = {
 *   since: "2024-01-01T00:00:00Z",
 *   until: "2023-01-01T00:00:00Z",
 *   sort: "asc",
 * };
 * ```
 * @example
 * ```ts
 * const config: Config = {
 *   since: null,
 *   until: null,
 *   sort: "asc",
 * };
 * ```
 */
export type RankingConfig = {
  since: string | null;
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
 *   since: "2024-01-01T00:00:00Z",
 *   until: "2023-01-01T00:00:00Z",
 *   sort: "asc",
 * };
 * const results = await getArticleCountGroupByUser(db, config);
 * ```
 */
export const getArticleCountGroupByUser = async (
  db: DrizzleD1Database<typeof schema>,
  { since, until, sort = "desc" }: RankingConfig,
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
      sort === "asc" ? asc(fileds.count) : desc(fileds.count),
    ])
    .all();
  return results.map(({ createdAt, ...rest }) => ({ ...rest }));
};
