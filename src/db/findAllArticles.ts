import { DrizzleD1Database } from "@/lib";
import * as schema from "./schema";
import { Article } from "@/schemas";

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
 * Configuration object.
 *
 * @param limit - Limit number of articles.
 * @param offset - Offset number of articles.
 * @param sinse - Date since articles.
 * @param until - Date until articles.
 * @example
 * const articles = await findAllArticles(db, { limit: 10, offset: 0 });
 */
export type FindAllArticlesConfig = {
  limit: number | null;
  offset: number | null;
  sinse: string | null;
  until: string | null;
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
  config: FindAllArticlesConfig
): Promise<FindAllArticlesReturnType> => {
  const defaultLimit = 10;
  const defaultOffset = 0;
  const { limit, offset, sinse, until } = config;
  const results = await db.query.articles.findMany({
    limit: limit ?? defaultLimit,
    offset: offset ?? defaultOffset,
    where:
      !sinse && !until
        ? undefined
        : (fileds, { between, gte, lte }) => {
            if (sinse && until) {
              return between(fileds.createdAt, sinse, until);
            }
            if (sinse) {
              return gte(fileds.createdAt, sinse);
            }
            if (until) {
              return lte(fileds.createdAt, until);
            }
          },
    orderBy: (fileds, { desc }) => [desc(fileds.createdAt)],
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
