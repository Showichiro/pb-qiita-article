import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";
import { Nullable } from "@/util/typeUtils";

/**
 * Find all articles.
 *
 * @param db - Database instance.
 * @param config - Configuration object.
 * @returns Array of articles.
 * @example
 * const articles = await findAllArticles(db, { limit: 10, offset: 0 });
 */
type FindAllArticlesReturnType = Array<
  typeof schema.articles.$inferSelect & {
    tags: Array<Nullable<Pick<typeof schema.tags.$inferSelect, "name">>>;
  }
>;

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
  config: { limit: number | null; offset: number | null }
): Promise<FindAllArticlesReturnType> => {
  const defaultLimit = 10;
  const defaultOffset = 0;
  const { limit, offset } = config;
  const results = await db.query.articles.findMany({
    limit: limit ?? defaultLimit,
    offset: offset ?? defaultOffset,
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
