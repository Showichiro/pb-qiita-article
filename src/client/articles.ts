import type { Article } from "@/schemas";

export type ArticleQuery = {
  since: string;
  until: string;
  orderField: "createdAt" | "likesCount" | "stocksCount";
  orderDirection: "asc" | "desc";
  limit: number;
  offset: number;
};
export type ArticleDraft = Omit<ArticleQuery, "limit"> & { limit: string };
export const toArticleDraft = (query: ArticleQuery): ArticleDraft => ({
  ...query,
  limit: String(query.limit),
});

export const defaultArticleQuery: ArticleQuery = {
  since: "",
  until: "",
  orderField: "createdAt",
  orderDirection: "desc",
  limit: 10,
  offset: 0,
};
const validDate = (value: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? value : "";
export function parseArticleQuery(params: URLSearchParams): ArticleQuery {
  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const raw = params.get(name);
    const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
    return Number.isSafeInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  };
  const field = params.get("orderField");
  return {
    since: validDate(params.get("since")),
    until: validDate(params.get("until")),
    orderField:
      field === "likesCount" || field === "stocksCount" ? field : "createdAt",
    orderDirection: params.get("orderDirection") === "asc" ? "asc" : "desc",
    limit: integer("limit", 10, 1, 100),
    offset: integer("offset", 0, 0, Number.MAX_SAFE_INTEGER),
  };
}
export function articleQueryParams(query: ArticleQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== "") params.set(key, String(value));
  return params;
}
export function serializeArticleBootstrap(value: {
  config: unknown;
  articles: Article[];
}): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
export async function fetchArticles(
  query: ArticleQuery,
  signal: AbortSignal,
): Promise<Article[]> {
  const response = await fetch(`/api/articles?${articleQueryParams(query)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`記事を取得できませんでした (${response.status})`);
  const articles: unknown = await response.json();
  if (
    !Array.isArray(articles) ||
    !articles.every(
      (article) =>
        article &&
        typeof article.id === "string" &&
        typeof article.title === "string" &&
        typeof article.userId === "string" &&
        typeof article.userName === "string" &&
        typeof article.createdAt === "string" &&
        typeof article.likesCount === "number" &&
        typeof article.stocksCount === "number" &&
        Array.isArray(article.tags) &&
        article.tags.every(
          (tag: { name?: unknown }) => tag && typeof tag.name === "string",
        ),
    )
  )
    throw new Error("記事データの形式が正しくありません");
  return articles as Article[];
}
