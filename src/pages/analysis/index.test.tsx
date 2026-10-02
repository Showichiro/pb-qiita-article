import { renderer } from "@/util/testUtils";
import {
  analysisActionSlotClass,
  analysisChartClass,
  analysisFormClass,
  analysisIslandClass,
  analysisResultsClass,
  analysisTagFieldClass,
  analysisTagLabelClass,
} from "@/client/analysis-presentation";
import { analysisStateParams, type AnalysisBootstrap } from "@/client/analysis";
import { AnalysisPage } from ".";

const data: AnalysisBootstrap = {
  state: {
    since: "2026-01-01",
    until: "2026-01-03",
    bucket: "day",
    author: "",
    tags: ["unknown"],
    metric: "likes",
    view: "chart",
  },
  rows: [
    {
      bucketStart: "2026-01-01",
      articleCount: 2,
      publishedArticleLikes: 9,
    },
    {
      bucketStart: "2026-01-02",
      articleCount: 0,
      publishedArticleLikes: 0,
    },
    {
      bucketStart: "2026-01-03",
      articleCount: 1,
      publishedArticleLikes: 3,
    },
  ],
  tagOptions: ["known"],
};

describe("AnalysisPage native fallback", () => {
  it("renders functional GET controls, preserves unknown tags, reserves the chart and includes the full table", async () => {
    const { text } = await renderer(<AnalysisPage {...data} />);
    expect(text).toContain('action="/analysis"');
    expect(text).toContain('method="get"');
    expect(text).toContain('name="since"');
    expect(text).toContain('name="until"');
    expect(text).toContain('name="bucket"');
    expect(text).toContain('name="author"');
    expect(text).toContain('name="tags"');
    expect(text).toContain('name="metric"');
    expect(text).toContain('name="view"');
    expect(text).toContain('value="unknown" selected');
    expect(text).toContain(analysisIslandClass);
    expect(text).toContain(analysisFormClass);
    expect(text).toContain(analysisChartClass);
    expect(text).toContain(analysisResultsClass);
    expect(text).toContain(analysisTagFieldClass);
    expect(text).toContain(analysisTagLabelClass);
    expect(text).toContain(analysisActionSlotClass);
    expect(text).toContain("公開記事の現在のいいね数");
    expect(text).toContain("期間中に獲得した数ではありません");
    expect(text).toContain("2026-01-01");
    expect(text).toContain(">9<");
    expect(text).toContain('id="analysis-bootstrap"');
    expect(text).toContain('data-slot="analysis-search-action"');
    expect(text).toContain('data-focus-id="analysis-auto-search"');
    expect(text).toContain("タグを解除");
    expect(text).toContain('data-slot="analysis-tags-field"');
    expect(text).toContain('data-focus-id="analysis-tag-clear"');
    expect(text).toContain(">適用</button>");
    const clearLink = text.match(
      /<a href="([^"]+)"[^>]*data-focus-id="analysis-tag-clear"/,
    );
    expect(clearLink?.[1]).toBe(
      `/analysis?${analysisStateParams({
        ...data.state,
        tags: [],
      })
        .toString()
        .replaceAll("&", "&amp;")}`,
    );
    const tagFieldStart = text.indexOf('data-slot="analysis-tags-field"');
    const clearLinkIndex = text.indexOf('data-focus-id="analysis-tag-clear"');
    expect(text.lastIndexOf("</label>", clearLinkIndex)).toBeGreaterThan(
      text.lastIndexOf("<label", tagFieldStart),
    );
  });

  it("keeps the native table for no-JavaScript users in default table view", async () => {
    const { text } = await renderer(
      <AnalysisPage
        {...data}
        state={{ ...data.state, metric: "posts", view: "table" }}
      />,
    );
    expect(text).not.toContain(analysisChartClass);
    expect(text).toContain('method="get"');
    expect(text).toContain(">2<");
    expect(text).toContain(">9<");
  });
});
