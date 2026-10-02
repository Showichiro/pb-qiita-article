import { renderer } from "@/util";
import { RankingPage } from ".";
import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";

const config = { since: null, until: null, view: "table" as const, topN: 10 };

describe("RankingPage SSR integration", () => {
  it("renders ranking page with nonempty bootstrap data and native tables", async () => {
    const postCounts: ArticleCountGroupByUser[] = [
      { userId: "user1", userName: "User 1", count: 10 },
      { userId: "user2", userName: "User 2", count: 5 },
    ];
    const likesCounts: LikesCountSchema[] = [
      { userId: "user1", userName: "User 1", totalLikesCount: "100" },
      { userId: "user2", userName: "User 2", totalLikesCount: "50" },
    ];
    const bootstrap = JSON.stringify({
      config: { since: "", until: "", view: "table", topN: 10 },
      postCounts,
      likesCounts,
    });

    const { text } = await renderer(
      <RankingPage
        bootstrap={bootstrap}
        config={config}
        postCounts={postCounts}
        likesCounts={likesCounts}
      />,
    );

    // Verify native tables are rendered
    expect(text).toContain("記事数ランキング");
    expect(text).toContain("いいね数ランキング");
    expect(text).toContain("user1");
    expect(text).toContain("user2");
    expect(text).toContain("10");
    expect(text).toContain("5");
    expect(text).toContain("100");
    expect(text).toContain("50");

    // Verify anchors are present
    expect(text).toContain('id="posts"');
    expect(text).toContain('id="likes"');

    // Verify author links
    expect(text).toContain("https://qiita.com/user1");
    expect(text).toContain("https://qiita.com/user2");

    // Verify bootstrap script is present
    expect(text).toContain('id="ranking-bootstrap"');
    expect(text).toContain('type="application/json"');

    // Verify data-slot attributes for visual parity
    expect(text).toContain('data-slot="card"');
    expect(text).toContain('data-slot="input"');
    expect(text).toContain('data-slot="button"');
    expect(text).toContain('data-slot="table"');
    expect(text).toContain('data-slot="table-container"');

    expect(text).toMatchSnapshot();
  });

  it("renders empty state with no data", async () => {
    const bootstrap = JSON.stringify({
      config: { since: "", until: "", view: "table", topN: 10 },
      postCounts: [],
      likesCounts: [],
    });

    const { text } = await renderer(
      <RankingPage
        bootstrap={bootstrap}
        config={config}
        postCounts={[]}
        likesCounts={[]}
      />,
    );

    expect(text).toContain("該当するデータはありません");
    expect(text).toMatchSnapshot();
  });

  it("reserves chart space before enhancement while retaining matching native tables", async () => {
    const postCounts: ArticleCountGroupByUser[] = [
      { userId: "first", userName: "First", count: 5 },
      { userId: "second", userName: "Second", count: 3 },
    ];
    const likesCounts: LikesCountSchema[] = [
      { userId: "first", userName: "First", totalLikesCount: "20" },
      { userId: "second", userName: "Second", totalLikesCount: null },
    ];
    const config = {
      since: null,
      until: null,
      view: "chart" as const,
      topN: 1,
    };
    const { text } = await renderer(
      <RankingPage
        bootstrap={JSON.stringify({
          config: { since: "", until: "", view: "chart", topN: 1 },
          postCounts,
          likesCounts,
        })}
        config={config}
        postCounts={postCounts}
        likesCounts={likesCounts}
      />,
    );

    expect(text.match(/h-\[320px\]/g)).toHaveLength(2);
    expect(text).toContain('aria-hidden="true"');
    expect(text).toContain('aria-label="記事数ランキング"');
    expect(text).toContain('aria-label="いいね数ランキング"');
    expect(text).toMatch(
      /<option(?=[^>]*value="chart")(?=[^>]*selected)[^>]*>/,
    );
    expect(text).toMatch(/<option(?=[^>]*value="1")(?=[^>]*selected)[^>]*>/);
    expect(text).toContain("first");
    expect(text.replace(/<script[^>]*>[\s\S]*?<\/script>/, "")).not.toContain(
      "second",
    );
    expect(text).toContain("期間内に公開された記事の現在の合計いいね数です。");
  });
});
