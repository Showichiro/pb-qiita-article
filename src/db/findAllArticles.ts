import type { DrizzleD1Database } from "@/lib";
import type * as schema from "./schema";
import type { Article } from "@/schemas";

/**
 * Find all articles.
 *
 * @param db - Database instance.
 * @param config - Configuration object.
 * @returns Array of articles.
 * @example
 * const articles = await findAllArticles(db, { limit: 10, offset: 0 });
 */
type FindAllArticlesReturnType = Array<Article>;

/**
 * Field to order articles by.
 */
export type OrderByField = keyof Pick<
  Article,
  "createdAt" | "likesCount" | "stocksCount"
>;

/**
 * Direction to order articles.
 */
export type OrderDirection = "asc" | "desc";

/**
 * Configuration object.
 *
 * @property {number | null} limit - Limit number of articles.
 * @property {number | null} offset - Offset number of articles.
 * @property {string | null} since - Date since articles.
 * @property {string | null} until - Date until articles.
 * @property {OrderByField} [orderField] - Field to order articles by.
 * @property {OrderDirection} [orderDirection] - Direction to order articles.
 * @example
 * const articles = await findAllArticles(db, { limit: 10, offset: 0 });
 */
export type FindAllArticlesConfig = {
  limit: number | null;
  offset: number | null;
  since: string | null;
  until: string | null;
  orderField?: OrderByField | null;
  orderDirection?: OrderDirection | null;
};

/**
 * Find all articles.
 *
 * @param db - Database instance.
 * @param config - Configuration object.
 * @returns Array of articles.
 * @example
 * const articles = await findAllArticles(db, { limit: 10, offset: 0 });
 */
export const findAllArticles = async (
  db: DrizzleD1Database<typeof schema>,
  config: FindAllArticlesConfig,
): Promise<FindAllArticlesReturnType> => {
  const defaultLimit = 10;
  const defaultOffset = 0;
  const { limit, offset, since, until, orderField, orderDirection } = config;
  const results = await db.query.articles.findMany({
    limit: limit ?? defaultLimit,
    offset: offset ?? defaultOffset,
    where:
      !since && !until
        ? undefined
        : (fileds, { between, gte, lte }) => {
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
    orderBy: orderField
      ? (fields, { asc, desc }) => {
          return orderDirection === "asc"
            ? asc(fields[orderField])
            : desc(fields[orderField]);
        }
      : (fileds, { desc }) => [desc(fileds.createdAt)],
    with: {
      tags: {
        columns: {
          articleId: false,
          id: false,
          name: true,
        },
      },
    },
  });
  return results;
};
