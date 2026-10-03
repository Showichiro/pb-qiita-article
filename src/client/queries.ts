import { queryOptions } from "@tanstack/react-query";
import {
  articleQueryParams,
  fetchArticles,
  parseArticleQuery,
  type ArticleQuery,
} from "./articles";
import {
  analysisQueryParams,
  fetchAnalysis,
  normalizeAnalysisTags,
  type AnalysisQuery,
} from "./analysis";
import {
  fetchLikesCounts,
  fetchPostCounts,
  rankingRequestParams,
  type RankingRequestQuery,
} from "./ranking";

export type ArticlesQueryData = {
  query: ArticleQuery;
  rows: Awaited<ReturnType<typeof fetchArticles>>;
};

export type RankingPostsQueryData = {
  query: RankingRequestQuery;
  rows: Awaited<ReturnType<typeof fetchPostCounts>>;
};

export type RankingLikesQueryData = {
  query: RankingRequestQuery;
  rows: Awaited<ReturnType<typeof fetchLikesCounts>>;
};

export type AnalysisQueryData = {
  query: AnalysisQuery;
  rows: Awaited<ReturnType<typeof fetchAnalysis>>;
};

export function normalizeArticleQuery(query: ArticleQuery): ArticleQuery {
  return parseArticleQuery(articleQueryParams(query));
}

export function articlesQueryKey(version: string, query: ArticleQuery) {
  return ["articles", version, normalizeArticleQuery(query)] as const;
}

export function articlesQueryOptions(version: string, query: ArticleQuery) {
  const normalizedQuery = normalizeArticleQuery(query);
  return queryOptions({
    queryKey: articlesQueryKey(version, normalizedQuery),
    queryFn: async (): Promise<ArticlesQueryData> => ({
      query: normalizedQuery,
      rows: await fetchArticles(normalizedQuery, version),
    }),
  });
}

export function normalizeRankingQuery(
  query: RankingRequestQuery,
): RankingRequestQuery {
  const params = rankingRequestParams(query);
  return {
    since: params.get("since") ?? "",
    until: params.get("until") ?? "",
  };
}

export function rankingPostsQueryKey(
  version: string,
  query: RankingRequestQuery,
) {
  return [
    "ranking",
    "post-counts",
    version,
    normalizeRankingQuery(query),
  ] as const;
}

export function rankingLikesQueryKey(
  version: string,
  query: RankingRequestQuery,
) {
  return [
    "ranking",
    "likes-counts",
    version,
    normalizeRankingQuery(query),
  ] as const;
}

export function rankingPostsQueryOptions(
  version: string,
  query: RankingRequestQuery,
) {
  const normalizedQuery = normalizeRankingQuery(query);
  return queryOptions({
    queryKey: rankingPostsQueryKey(version, normalizedQuery),
    queryFn: async (): Promise<RankingPostsQueryData> => ({
      query: normalizedQuery,
      rows: await fetchPostCounts(normalizedQuery, version),
    }),
  });
}

export function rankingLikesQueryOptions(
  version: string,
  query: RankingRequestQuery,
) {
  const normalizedQuery = normalizeRankingQuery(query);
  return queryOptions({
    queryKey: rankingLikesQueryKey(version, normalizedQuery),
    queryFn: async (): Promise<RankingLikesQueryData> => ({
      query: normalizedQuery,
      rows: await fetchLikesCounts(normalizedQuery, version),
    }),
  });
}

export function normalizeAnalysisQuery(query: AnalysisQuery): AnalysisQuery {
  const params = analysisQueryParams(query);
  return {
    since: params.get("since") ?? "",
    until: params.get("until") ?? "",
    bucket: query.bucket,
    author: query.author.trim(),
    tags: normalizeAnalysisTags(query.tags),
  };
}

export function analysisQueryKey(version: string, query: AnalysisQuery) {
  return [
    "analysis",
    "time-series",
    version,
    normalizeAnalysisQuery(query),
  ] as const;
}

export function analysisQueryOptions(version: string, query: AnalysisQuery) {
  const normalizedQuery = normalizeAnalysisQuery(query);
  return queryOptions({
    queryKey: analysisQueryKey(version, normalizedQuery),
    queryFn: async (): Promise<AnalysisQueryData> => ({
      query: normalizedQuery,
      rows: await fetchAnalysis(normalizedQuery, version),
    }),
  });
}
