import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import {
  adaptRankingConfig,
  commitRankingDraft,
  defaultRankingQuery,
  isLikesCountRows,
  isPostCountRows,
  isRankingQuery,
  likesCountForChart,
  parseRankingQuery,
  rankingQueryParams,
  rankingRequestKey,
  rankingRequestParams,
  serializeRankingBootstrap,
  toRankingDraft,
  validateRankingDraft,
} from "./ranking";

describe("ranking query functions", () => {
  it("uses table view and top 10 as the defaults", () => {
    expect(parseRankingQuery(new URLSearchParams())).toEqual(
      defaultRankingQuery,
    );
  });

  it("restores date filters and display controls from the URL", () => {
    expect(
      parseRankingQuery(
        new URLSearchParams(
          "since=2024-01-01&until=2024-12-31&view=chart&topN=7",
        ),
      ),
    ).toEqual({
      since: "2024-01-01",
      until: "2024-12-31",
      view: "chart",
      topN: 7,
    });
  });

  it.each([
    ["view=table&topN=10", "table", 10],
    ["view=other&topN=0", "table", 1],
    ["view=chart&topN=101", "chart", 100],
    ["view=chart&topN=NaN", "chart", 10],
    ["view=chart&topN=9007199254740992", "chart", 10],
  ])("bounds or defaults invalid display values in %s", (raw, view, topN) => {
    expect(parseRankingQuery(new URLSearchParams(raw))).toMatchObject({
      view,
      topN,
    });
  });

  it("retains date validation and normalizes invalid URL dates", () => {
    expect(parseRankingQuery(new URLSearchParams("since=invalid")).since).toBe(
      "",
    );
    expect(() =>
      parseRankingQuery(
        new URLSearchParams("since=2024-12-31&until=2024-01-01"),
      ),
    ).toThrow("開始日は終了日より前にしてください");
  });

  it("omits empty dates and default display settings from the canonical URL", () => {
    expect(rankingQueryParams(defaultRankingQuery).toString()).toBe("");
    expect(
      rankingQueryParams({
        since: "2024-01-01",
        until: "",
        view: "chart",
        topN: 5,
      }).toString(),
    ).toBe("since=2024-01-01&view=chart&topN=5");
  });

  it("excludes display controls from data resource keys and API params", () => {
    const table = {
      since: "2024-01-01",
      until: "2024-12-31",
      view: "table" as const,
      topN: 10,
    };
    const chart = { ...table, view: "chart" as const, topN: 2 };
    expect(rankingRequestKey(table)).toBe(rankingRequestKey(chart));
    expect(rankingRequestParams(chart).toString()).toBe(
      "since=2024-01-01&until=2024-12-31",
    );
  });

  it("converts query dates to the draft and preserves an urgent draft", () => {
    const query = {
      since: "2024-01-01",
      until: "2024-12-31",
      view: "chart" as const,
      topN: 2,
    };
    expect(toRankingDraft(query)).toEqual({
      since: "2024-01-01",
      until: "2024-12-31",
    });
    expect(commitRankingDraft({ since: "2024-02-01", until: "" })).toEqual({
      since: "2024-02-01",
      until: "",
    });
    expect(
      validateRankingDraft({
        since: "2024-12-31",
        until: "2024-01-01",
      }),
    ).toBe("開始日は終了日より前にしてください");
  });

  it("normalizes empty server dates and keeps table/top-10 defaults", () => {
    expect(adaptRankingConfig({ since: null, until: null })).toEqual({
      since: "",
      until: "",
      view: "table",
      topN: 10,
    });
    expect(
      adaptRankingConfig({ since: "2024-01-01", until: "2024-12-31" }),
    ).toEqual({
      since: "2024-01-01",
      until: "2024-12-31",
      view: "table",
      topN: 10,
    });
  });

  it("normalizes nullable likes only for chart coordinates", () => {
    expect(likesCountForChart("100")).toBe(100);
    expect(likesCountForChart("0")).toBe(0);
    expect(likesCountForChart(null)).toBeNull();
    expect(likesCountForChart("Infinity")).toBeNull();
    expect(likesCountForChart("1e3")).toBeNull();
    expect(likesCountForChart("9007199254740992")).toBeNull();
  });

  it("validates complete bootstrap/API rows and finite chart values", () => {
    expect(
      isRankingQuery({
        since: "",
        until: "",
        view: "chart",
        topN: 100,
      }),
    ).toBe(true);
    expect(isRankingQuery({ ...defaultRankingQuery, topN: 101 })).toBe(false);
    expect(isPostCountRows([{ userId: "a", userName: "A", count: 2 }])).toBe(
      true,
    );
    expect(
      isPostCountRows([{ userId: "a", userName: "A", count: Number.NaN }]),
    ).toBe(false);
    expect(
      isPostCountRows([
        { userId: "a", userName: "A", count: Number.POSITIVE_INFINITY },
      ]),
    ).toBe(false);
    expect(
      isLikesCountRows([
        { userId: "a", userName: "A", totalLikesCount: null },
        { userId: "b", userName: "B", totalLikesCount: "4" },
      ]),
    ).toBe(true);
    expect(
      isLikesCountRows([
        { userId: "a", userName: "A", totalLikesCount: "Infinity" },
      ]),
    ).toBe(false);
  });

  it("serializes bootstrap data with script-breaking characters escaped", () => {
    const config = { ...defaultRankingQuery };
    const postCounts: ArticleCountGroupByUser[] = [
      { userId: "author", userName: "</script><img>", count: 1 },
    ];
    const likesCounts: LikesCountSchema[] = [
      { userId: "author", userName: "Author", totalLikesCount: null },
    ];
    const serialized = serializeRankingBootstrap({
      config,
      postCounts,
      likesCounts,
    });
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toContain("&");
    expect(JSON.parse(serialized)).toEqual({
      config,
      postCounts,
      likesCounts,
    });
  });
});
