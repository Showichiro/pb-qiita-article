import { renderer } from "@/util";
import { Ranking, RankingRange, RankingScrollMenu } from "@/components";

describe("Ranking", () => {
  it("should render ranking", async () => {
    const { text } = await renderer(
      <Ranking
        articleCountGroupByUsers={[
          {
            count: 10,
            userId: "userId",
            userName: "userName",
          },
        ]}
        likesCounts={[
          {
            totalLikesCount: "11",
            userId: "userId2",
            userName: "userName2",
          },
        ]}
      />
    );
    expect(text).toMatchSnapshot();
  });
});

describe("RankingRange", () => {
  it("renders ranking date range", async () => {
    const { text } = await renderer(
      <RankingRange default={{ since: "2024-02-21", until: "2024-04-01" }} />
    );
    expect(text).toMatchSnapshot();
  });
});

describe("RankingScrollMenu", () => {
  it("renders ranking scroll menu", async () => {
    const { text } = await renderer(<RankingScrollMenu />);
    expect(text).toMatchSnapshot();
  });
});
