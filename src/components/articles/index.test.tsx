import { ArticlesTable, SelectBoxPageLimit } from "@/components";
import { renderer } from "@/util";

describe("ArticleTable", () => {
  it("should render articles html", async () => {
    const { text } = await renderer(
      <ArticlesTable
        articles={[
          {
            id: "123456",
            createdAt: new Date(0).toISOString(),
            likesCount: 1,
            stocksCount: 2,
            tags: [],
            title: "test-title",
            userId: "userId",
            userName: "userName",
          },
        ]}
      />
    );
    expect(text).toMatchSnapshot();
  });
});

describe("SelectBoxPageLimit", () => {
  it("should render selectbox page limit", async () => {
    const { text } = await renderer(<SelectBoxPageLimit limit={10} page={3} />);
    expect(text).toMatchSnapshot();
  });
});
