import type { findArticleTags, getArticleTimeSeries } from "@/db";
import type { TimeSeriesQuery, TimeSeriesResponse } from "@/schemas";
import { loadAnalysisPageData } from "./page";

describe("analysis page data", () => {
  it("loads the time series and tag options once for the native bootstrap", async () => {
    const db = {} as Parameters<typeof getArticleTimeSeries>[0];
    const query: TimeSeriesQuery = {
      since: "2026-01-01",
      until: "2026-01-03",
      bucket: "day",
      author: "Writer",
      tags: ["C#", "unknown"],
    };
    const rows: TimeSeriesResponse["rows"] = [
      {
        bucketStart: "2026-01-01",
        articleCount: 1,
        publishedArticleLikes: 4,
      },
      {
        bucketStart: "2026-01-02",
        articleCount: 0,
        publishedArticleLikes: 0,
      },
      {
        bucketStart: "2026-01-03",
        articleCount: 2,
        publishedArticleLikes: 8,
      },
    ];
    const getRows: typeof getArticleTimeSeries = vi.fn(
      async (_db, _version, config) => ({
        since: config.since,
        until: config.until,
        bucket: config.bucket,
        rows,
      }),
    );
    const getTags: typeof findArticleTags = vi.fn(async () => ["known"]);
    const result = await loadAnalysisPageData(
      db,
      query,
      new URLSearchParams("metric=likes&view=chart&tags=unknown"),
      "v1",
      { getArticleTimeSeries: getRows, findArticleTags: getTags },
    );

    expect(getRows).toHaveBeenCalledTimes(1);
    expect(getRows).toHaveBeenCalledWith(db, "v1", {
      since: query.since,
      until: query.until,
      bucket: query.bucket,
      author: query.author,
      tags: query.tags,
    });
    expect(getTags).toHaveBeenCalledTimes(1);
    expect(getTags).toHaveBeenCalledWith(db, "v1");
    expect(result).toEqual({
      dataVersion: "v1",
      publishedSequence: 0,
      state: {
        since: query.since,
        until: query.until,
        bucket: query.bucket,
        author: query.author,
        tags: query.tags,
        metric: "likes",
        view: "chart",
      },
      rows,
      tagOptions: ["C#", "known", "unknown"],
    });
  });

  it("rejects invalid query state before reading page data", async () => {
    const db = {} as Parameters<typeof getArticleTimeSeries>[0];
    const query: TimeSeriesQuery = {
      since: "2026-01-03",
      until: "2026-01-01",
      bucket: "day",
      author: undefined,
      tags: [],
    };
    const getRows: typeof getArticleTimeSeries = vi.fn();
    const getTags: typeof findArticleTags = vi.fn();
    await expect(
      loadAnalysisPageData(db, query, new URLSearchParams(), "v1", {
        getArticleTimeSeries: getRows,
        findArticleTags: getTags,
      }),
    ).rejects.toThrow("以前");
    expect(getRows).not.toHaveBeenCalled();
    expect(getTags).not.toHaveBeenCalled();
  });
});
