import { getArticleTimeSeries } from "@/db";
import type { TimeSeriesQuery } from "@/schemas";
import type { Env } from "@/util";
import type { Handler } from "hono";
import { withDataVersion } from "@/util/dataVersion";
export * from "./page";

export const timeSeriesHandler: Handler<
  Env,
  "/api/analysis/time-series",
  {
    in: { query: TimeSeriesQuery };
    out: { query: TimeSeriesQuery };
  }
> = async (c) => {
  const query = c.req.valid("query");

  return withDataVersion(c, async (db, generationId) => {
    const result = await getArticleTimeSeries(db, generationId, {
      since: query.since,
      until: query.until,
      bucket: query.bucket,
      author: query.author,
      tags: query.tags,
    });
    return c.json(result);
  });
};
