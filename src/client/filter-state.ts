import { japanDate } from "@/util/japanTime";
import type { ArticleQuery } from "./articles";

export type ActiveFilter = {
  key: string;
  label: string;
  clear: Record<string, string | string[]>;
};

export function commonFilters(query: {
  since: string;
  until: string;
  author?: string;
  tags?: string[];
}): ActiveFilter[] {
  const filters: ActiveFilter[] = [];
  if (query.author?.trim())
    filters.push({
      key: "author",
      label: `投稿者: ${query.author}`,
      clear: { author: "" },
    });
  if (query.tags?.length)
    filters.push({
      key: "tags",
      label: `タグ: ${query.tags.join("・")}（すべて一致）`,
      clear: { tags: [] },
    });
  if (query.since || query.until)
    filters.push({
      key: "period",
      label: `期間: ${query.since ? japanDate(query.since) : "指定なし"} 〜 ${query.until ? japanDate(query.until) : "指定なし"}`,
      clear: { since: "", until: "" },
    });
  return filters;
}

export function articleFilters(query: ArticleQuery): ActiveFilter[] {
  const filters = commonFilters(query);
  if (query.q.trim())
    filters.unshift({
      key: "q",
      label: `キーワード: ${query.q}`,
      clear: { q: "" },
    });
  for (const [min, max, label] of [
    ["minLikes", "maxLikes", "いいね数"],
    ["minStocks", "maxStocks", "ストック数"],
  ] as const) {
    if (query[min] !== null || query[max] !== null)
      filters.push({
        key: min,
        label: `${label}: ${query[min] ?? "指定なし"} 〜 ${query[max] ?? "指定なし"}`,
        clear: { [min]: "", [max]: "" },
      });
  }
  return filters;
}

export const articleSortOptions = [
  { value: "createdAt:desc", label: "新しい順" },
  { value: "createdAt:asc", label: "古い順" },
  { value: "likesCount:desc", label: "いいねが多い順" },
  { value: "likesCount:asc", label: "いいねが少ない順" },
  { value: "stocksCount:desc", label: "ストックが多い順" },
  { value: "stocksCount:asc", label: "ストックが少ない順" },
] as const;

export function parseArticleSort(
  value: string,
): Pick<ArticleQuery, "orderField" | "orderDirection"> | null {
  if (!articleSortOptions.some((option) => option.value === value)) return null;
  const [orderField, orderDirection] = value.split(":");
  return {
    orderField: orderField as ArticleQuery["orderField"],
    orderDirection: orderDirection as ArticleQuery["orderDirection"],
  };
}
