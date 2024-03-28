import { renderer } from "@/util";
import { Ranking } from "@/components";

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
