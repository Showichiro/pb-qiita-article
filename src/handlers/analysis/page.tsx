import { findArticleTags, getArticleTimeSeries, type schema } from "@/db";
import type { DrizzleD1Database } from "@/lib";
import {
  analysisDraftError,
  normalizeAnalysisTags,
  parseAnalysisState,
  type AnalysisBootstrap,
  type AnalysisState,
} from "@/client/analysis";
import type { TimeSeriesQuery } from "@/schemas";
import { AnalysisPage } from "@/pages";
import type { Env } from "@/util";
import type { Handler } from "hono";

type AnalysisPageDataSource = {
  getArticleTimeSeries: typeof getArticleTimeSeries;
  findArticleTags: typeof findArticleTags;
};

export async function loadAnalysisPageData(
  db: DrizzleD1Database<typeof schema>,
  query: TimeSeriesQuery,
  params: URLSearchParams,
  source: AnalysisPageDataSource = { getArticleTimeSeries, findArticleTags },
): Promise<AnalysisBootstrap> {
  const parsed = parseAnalysisState(params);
  const state: AnalysisState = {
    ...parsed,
    since: query.since,
    until: query.until,
    bucket: query.bucket,
    author: query.author ?? "",
    tags: query.tags,
  };
  const error = analysisDraftError({
    since: state.since,
    until: state.until,
    bucket: state.bucket,
    author: state.author,
    tags: state.tags,
  });
  if (error) throw new Error(`Invalid analysis page query: ${error}`);
  const [response, tagOptions] = await Promise.all([
    source.getArticleTimeSeries(db, {
      since: query.since,
      until: query.until,
      bucket: query.bucket,
      author: query.author,
      tags: query.tags,
    }),
    source.findArticleTags(db),
  ]);
  return {
    state,
    rows: response.rows,
    tagOptions: normalizeAnalysisTags([...tagOptions, ...state.tags]),
  };
}

export const analysisPageHandler: Handler<
  Env,
  "/analysis",
  {
    in: { query: TimeSeriesQuery };
    out: { query: TimeSeriesQuery };
  }
> = async (c) => {
  const bootstrap = await loadAnalysisPageData(
    c.var.db,
    c.req.valid("query"),
    new URL(c.req.url).searchParams,
  );
  return c.render(<AnalysisPage {...bootstrap} />, {
    title: "記事の時系列分析",
  });
};
