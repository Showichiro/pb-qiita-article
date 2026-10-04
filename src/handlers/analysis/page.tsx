import { AnalysisPage } from "@/pages";
import type { TimeSeriesQuery } from "@/schemas";
import type { Env } from "@/util";
import type { Handler } from "hono";
import { withDataVersion } from "@/util/dataVersion";
import { loadAnalysisPageData } from "@/services/analysisQueries";
export { loadAnalysisPageData } from "@/services/analysisQueries";

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
