import type { DrizzleD1Database } from "@/lib";
import type * as schema from "./schema";
import type { Article } from "@/schemas";
import { assertGenerationPublished } from "./dataGenerations";
import { eq, sql } from "drizzle-orm";

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
  q?: string;
  author?: string;
  tags?: string[];
  minLikes?: number | null;
  maxLikes?: number | null;
  minStocks?: number | null;
  maxStocks?: number | null;
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
  generationId: string,
  config: FindAllArticlesConfig,
): Promise<FindAllArticlesReturnType> => {
  await assertGenerationPublished(db, generationId);
  const defaultLimit = 10;
  const defaultOffset = 0;
  const { limit, offset, since, until, orderField, orderDirection } = config;
  const results = await db.query.generationArticles.findMany({
    limit: limit ?? defaultLimit,
    offset: offset ?? defaultOffset,
    columns: {
      generationId: false,
    },
    where: (fields, { and, or, gte, lte }) => {
      // D1 limits LIKE/GLOB patterns to 50 bytes. instr treats the full bound
      // text literally; SQLite lower preserves LIKE's ASCII-only case folding.
      const q = config.q?.trim();
      const author = config.author?.trim();
      const tags = [
        ...new Set(config.tags?.map((tag) => tag.trim()).filter(Boolean)),
      ];
      return and(
        eq(fields.generationId, generationId),
        since ? gte(fields.createdAt, since) : undefined,
        until ? lte(fields.createdAt, until) : undefined,
        q ? sql`instr(lower(${fields.title}), lower(${q})) > 0` : undefined,
        author
          ? or(
              sql`instr(lower(${fields.userId}), lower(${author})) > 0`,
              sql`instr(lower(${fields.userName}), lower(${author})) > 0`,
            )
          : undefined,
        config.minLikes != null
          ? gte(fields.likesCount, config.minLikes)
          : undefined,
        config.maxLikes != null
          ? lte(fields.likesCount, config.maxLikes)
          : undefined,
        config.minStocks != null
          ? gte(fields.stocksCount, config.minStocks)
          : undefined,
        config.maxStocks != null
          ? lte(fields.stocksCount, config.maxStocks)
          : undefined,
        ...tags.map(
          (tag) =>
            sql`exists (select 1 from generation_tags as selected_tag where selected_tag.generation_id = ${generationId} and selected_tag.article_id = ${fields.id} and selected_tag.name = ${tag})`,
        ),
      );
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
        orderBy: (fields, { asc }) => [asc(fields.position)],
        columns: {
          articleId: false,
          generationId: false,
          id: false,
          position: false,
          name: true,
        },
      },
    },
  });
  return results;
};
