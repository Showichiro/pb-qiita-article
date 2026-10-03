import {
  analysisBucketStarts,
  analysisDraftError,
  analysisQueryParams,
  analysisStateParams,
  commitAnalysisDraft,
  defaultAnalysisQuery,
  fetchAnalysis,
  isUtcDate,
  normalizeAnalysisTags,
  parseAnalysisState,
  serializeAnalysisBootstrap,
  validateAnalysisResponse,
  type AnalysisDraft,
  type AnalysisQuery,
} from "./analysis";

const draft = (updates: Partial<AnalysisDraft> = {}): AnalysisDraft => ({
  since: "2026-01-01",
  until: "2026-01-03",
  bucket: "day",
  author: "",
  tags: [],
  ...updates,
});

const query: AnalysisQuery = {
  since: "2026-01-01",
  until: "2026-01-03",
  bucket: "day",
  author: "",
  tags: [],
};

describe("analysis query and response contract", () => {
  it("defaults to the last 90 UTC calendar days, ending on the UTC date", () => {
    expect(defaultAnalysisQuery(new Date("2026-10-03T23:59:00-09:00"))).toEqual(
      {
        since: "2026-07-07",
        until: "2026-10-04",
        bucket: "day",
        author: "",
        tags: [],
      },
    );
  });

  it.each([
    ["2024-02-29", true],
    ["2000-02-29", true],
    ["0000-01-01", false],
    ["2023-02-29", false],
    ["1900-02-29", false],
    ["2026-02-31", false],
    ["2026-1-1", false],
    ["2026-01-01T00:00:00Z", false],
  ])("checks strict real UTC date %s", (value, expected) => {
    expect(isUtcDate(value)).toBe(expected);
  });

  it("validates inverted, elapsed, and bucket-count boundaries", () => {
    expect(analysisDraftError(draft({ since: "2026-01-04" }))).toContain(
      "以前",
    );
    expect(
      analysisDraftError(
        draft({
          since: "2014-01-01",
          until: "2025-01-01",
          bucket: "month",
        }),
      ),
    ).toContain("3660");
    expect(
      analysisDraftError(draft({ since: "2020-01-01", until: "2021-02-03" })),
    ).toBeNull();
    expect(
      analysisDraftError(draft({ since: "2020-01-01", until: "2021-02-04" })),
    ).toContain("400");
    expect(
      analysisDraftError(
        draft({
          since: "2020-01-06",
          until: new Date(
            Date.parse("2020-01-06T00:00:00Z") + 399 * 7 * 86_400_000,
          )
            .toISOString()
            .slice(0, 10),
          bucket: "week",
        }),
      ),
    ).toBeNull();
    expect(
      analysisDraftError(
        draft({
          since: "2020-01-06",
          until: new Date(
            Date.parse("2020-01-06T00:00:00Z") + 400 * 7 * 86_400_000,
          )
            .toISOString()
            .slice(0, 10),
          bucket: "week",
        }),
      ),
    ).toContain("400");
    expect(
      analysisDraftError(
        draft({ since: "2026-01-01", until: "2026-01-03", bucket: "month" }),
      ),
    ).toBeNull();
  });

  it("uses zero-fill bucket starts for days, Monday weeks, and first-of-month", () => {
    expect(analysisBucketStarts("2026-01-01", "2026-01-03", "day")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(analysisBucketStarts("2026-01-01", "2026-01-10", "week")).toEqual([
      "2025-12-29",
      "2026-01-05",
    ]);
    expect(analysisBucketStarts("2024-02-29", "2024-03-01", "month")).toEqual([
      "2024-02-01",
      "2024-03-01",
    ]);
  });

  it("normalizes tags and keeps commas inside a single exact tag", () => {
    expect(normalizeAnalysisTags([" C# ", "a,b", "C#", ""])).toEqual([
      "C#",
      "a,b",
    ]);
    const committed = commitAnalysisDraft(
      draft({ author: " Writer ", tags: ["b", "a,b", "b"] }),
    );
    expect(committed).toEqual({
      ...query,
      author: "Writer",
      tags: ["a,b", "b"],
    });
    expect(analysisQueryParams(committed).getAll("tags")).toEqual(["a,b", "b"]);
    expect(analysisDraftError(draft({ author: "x".repeat(201) }))).toContain(
      "200",
    );
    expect(
      analysisDraftError(
        draft({ tags: Array.from({ length: 21 }, (_, index) => `${index}`) }),
      ),
    ).toContain("20");
    expect(analysisDraftError(draft({ tags: ["x".repeat(101)] }))).toContain(
      "100",
    );
  });

  it("restores view and metric without including them in cached API identity", () => {
    const state = parseAnalysisState(
      new URLSearchParams(
        "since=2026-01-01&until=2026-01-03&bucket=week&author=Writer&tags=a&tags=a&tags=b&metric=likes&view=chart",
      ),
    );
    expect(state).toEqual({
      since: "2026-01-01",
      until: "2026-01-03",
      bucket: "week",
      author: "Writer",
      tags: ["a", "b"],
      metric: "likes",
      view: "chart",
    });
    expect(analysisStateParams(state).get("view")).toBe("chart");
    expect(analysisQueryParams(state).has("view")).toBe(false);
    expect(analysisQueryParams(state).has("metric")).toBe(false);
  });

  it("rejects incomplete, misordered, or unsafe API rows", () => {
    expect(() =>
      validateAnalysisResponse(
        {
          since: query.since,
          until: query.until,
          bucket: query.bucket,
          rows: [
            {
              bucketStart: "2026-01-01",
              articleCount: 0,
              publishedArticleLikes: 0,
            },
          ],
        },
        query,
      ),
    ).toThrow("形式");
    expect(() =>
      validateAnalysisResponse(
        {
          since: query.since,
          until: query.until,
          bucket: query.bucket,
          rows: [
            {
              bucketStart: "2026-01-01",
              articleCount: -1,
              publishedArticleLikes: 0,
            },
            {
              bucketStart: "2026-01-02",
              articleCount: 0,
              publishedArticleLikes: 0,
            },
            {
              bucketStart: "2026-01-03",
              articleCount: 0,
              publishedArticleLikes: 0,
            },
          ],
        },
        query,
      ),
    ).toThrow("形式");
  });

  it("fetches the exact API query and surfaces HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          since: query.since,
          until: query.until,
          bucket: query.bucket,
          rows: analysisBucketStarts(
            query.since,
            query.until,
            query.bucket,
          ).map((bucketStart) => ({
            bucketStart,
            articleCount: 1,
            publishedArticleLikes: 4,
          })),
        }),
        {
          status: 200,
          headers: new Headers({ "X-Data-Version": "v1" }),
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(fetchAnalysis(query, "v1")).resolves.toHaveLength(3);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/analysis/time-series?since=2026-01-01&until=2026-01-03",
      );
      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
        "X-Expected-Data-Version": "v1",
      });
      fetchMock.mockResolvedValue(
        new Response(null, { status: 503, headers: new Headers() }),
      );
      await expect(fetchAnalysis(query, "v1")).rejects.toThrow("(503)");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("escapes script-significant bootstrap characters", () => {
    const bootstrap = serializeAnalysisBootstrap({
      dataVersion: "v1",
      state: {
        ...query,
        author: "</script><>&\u2028",
        metric: "posts",
        view: "table",
      },
      rows: [],
      tagOptions: [],
    });
    expect(bootstrap).not.toContain("</script>");
    expect(bootstrap).toContain("\\u003c");
    expect(bootstrap).toContain("\\u2028");
  });
});
