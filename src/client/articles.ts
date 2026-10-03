import type { Article } from "@/schemas";
import { assertResponseVersion } from "./data-version";

export type ArticleQuery = {
  q: string;
  author: string;
  tags: string[];
  minLikes: number | null;
  maxLikes: number | null;
  minStocks: number | null;
  maxStocks: number | null;
  since: string;
  until: string;
  orderField: "createdAt" | "likesCount" | "stocksCount";
  orderDirection: "asc" | "desc";
  limit: number;
  offset: number;
};
export const rangeFields = [
  "minLikes",
  "maxLikes",
  "minStocks",
  "maxStocks",
] as const;
export type RangeField = (typeof rangeFields)[number];
export type ArticleDraft = Omit<ArticleQuery, "limit" | RangeField> & {
  limit: string;
} & Record<RangeField, string>;
export const toArticleDraft = (query: ArticleQuery): ArticleDraft => ({
  ...query,
  limit: String(query.limit),
  minLikes: query.minLikes === null ? "" : String(query.minLikes),
  maxLikes: query.maxLikes === null ? "" : String(query.maxLikes),
  minStocks: query.minStocks === null ? "" : String(query.minStocks),
  maxStocks: query.maxStocks === null ? "" : String(query.maxStocks),
});
export function configQueryParams(config: object): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(config)) {
    if (value == null || value === "") continue;
    for (const item of Array.isArray(value) ? value : [value])
      params.append(key, String(item));
  }
  return params;
}
export const normalizeTags = (tags: string[]) =>
  [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort();
export function validateArticleDraft(draft: ArticleDraft): string | null {
  if (draft.q.trim().length > 200 || draft.author.trim().length > 200)
    return "キーワードと投稿者は200文字以内で入力してください。";
  const tags = normalizeTags(draft.tags);
  if (tags.length > 20 || tags.some((tag) => tag.length > 100))
    return "タグは各100文字以内、20個まで選択してください。";
  for (const key of rangeFields) {
    const value = draft[key].trim();
    const count = Number(value);
    if (value && (!Number.isSafeInteger(count) || count < 0))
      return "件数の範囲は0以上の整数で入力してください。";
  }
  for (const [min, max] of [
    ["minLikes", "maxLikes"],
    ["minStocks", "maxStocks"],
  ] as const)
    if (
      draft[min].trim() &&
      draft[max].trim() &&
      Number(draft[min]) > Number(draft[max])
    )
      return "件数の下限は上限以下にしてください。";
  return null;
}
export function commitArticleDraft(draft: ArticleDraft): ArticleQuery {
  const error = validateArticleDraft(draft);
  if (error) throw new Error(error);
  return parseArticleQuery(configQueryParams({ ...draft, offset: 0 }));
}

export const defaultArticleQuery: ArticleQuery = {
  q: "",
  author: "",
  tags: [],
  minLikes: null,
  maxLikes: null,
  minStocks: null,
  maxStocks: null,
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
  const bounds = Object.fromEntries(
    rangeFields.map((key) => {
      const raw = params.get(key)?.trim();
      if (!raw) return [key, null];
      const count = Number(raw);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("件数の範囲は0以上の整数で入力してください。");
      return [key, count];
    }),
  ) as Record<RangeField, number | null>;
  const filters = {
    q: params.get("q")?.trim() ?? "",
    author: params.get("author")?.trim() ?? "",
    tags: normalizeTags(params.getAll("tags")),
    ...bounds,
  };
  const error = validateArticleDraft(
    toArticleDraft({ ...defaultArticleQuery, ...filters }),
  );
  if (error) throw new Error(error);
  const field = params.get("orderField");
  return {
    ...filters,
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
  return configQueryParams({
    ...query,
    q: query.q.trim(),
    author: query.author.trim(),
    tags: normalizeTags(query.tags),
  });
}
export function serializeArticleBootstrap(value: {
  tagOptions?: string[];
  config: unknown;
  articles: Article[];
  dataVersion?: string;
  publishedSequence?: number;
}): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
export async function fetchArticles(
  query: ArticleQuery,
  expectedVersion: string,
  signal?: AbortSignal,
): Promise<Article[]> {
  const response = await fetch(`/api/articles?${articleQueryParams(query)}`, {
    signal,
    headers: {
      Accept: "application/json",
      "X-Expected-Data-Version": expectedVersion,
    },
  });
  assertResponseVersion(response, expectedVersion);
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
