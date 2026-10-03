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
import { withDataVersion } from "@/util/dataVersion";

type AnalysisPageDataSource = {
  getArticleTimeSeries: typeof getArticleTimeSeries;
  findArticleTags: typeof findArticleTags;
};

export async function loadAnalysisPageData(
  db: DrizzleD1Database<typeof schema>,
  query: TimeSeriesQuery,
  params: URLSearchParams,
  generationId: string,
  source: AnalysisPageDataSource = { getArticleTimeSeries, findArticleTags },
  publishedSequence = 0,
): Promise<
  AnalysisBootstrap & { dataVersion: string; publishedSequence: number }
> {
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
    source.getArticleTimeSeries(db, generationId, {
      since: query.since,
      until: query.until,
      bucket: query.bucket,
      author: query.author,
      tags: query.tags,
    }),
    source.findArticleTags(db, generationId),
  ]);

  return {
    state,
    rows: response.rows,
    tagOptions: normalizeAnalysisTags([...tagOptions, ...state.tags]),
    dataVersion: generationId,
    publishedSequence,
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
  return withDataVersion(c, async (db, generationId, publishedSequence) => {
    const bootstrap = await loadAnalysisPageData(
      db,
      c.req.valid("query"),
      new URL(c.req.url).searchParams,
      generationId,
      undefined,
      publishedSequence,
    );
    return c.render(<AnalysisPage {...bootstrap} />, {
      title: "記事の時系列分析",
    });
  });
};
