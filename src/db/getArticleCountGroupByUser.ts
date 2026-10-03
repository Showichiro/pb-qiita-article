import {
  type DrizzleD1Database,
  asc,
  and,
  count,
  desc,
  between,
  eq,
  gte,
  lte,
} from "@/lib";
import { assertGenerationPublished } from "./dataGenerations";
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
  generationId: string,
  { since, until, sort = "desc" }: RankingConfig,
): Promise<Array<ArticleCountGroupByUser>> => {
  await assertGenerationPublished(db, generationId);
  const results = await db
    .select({
      count: count(schema.generationArticles.id),
      userId: schema.generationArticles.userId,
      userName: schema.generationArticles.userName,
    })
    .from(schema.generationArticles)
    .where(
      and(
        eq(schema.generationArticles.generationId, generationId),
        since && until
          ? between(schema.generationArticles.createdAt, since, until)
          : since
            ? gte(schema.generationArticles.createdAt, since)
            : until
              ? lte(schema.generationArticles.createdAt, until)
              : undefined,
      ),
    )
    .groupBy((fields) => fields.userId)
    .orderBy((fields) => [
      sort === "asc" ? asc(fields.count) : desc(fields.count),
    ])
    .all();
  return results;
};
