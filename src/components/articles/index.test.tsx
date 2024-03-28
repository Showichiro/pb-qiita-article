import { Hono } from "@/lib";
import { ArticlesTable } from "@/components";
import { renderer } from "@/util";

describe("ArticleTable", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("should render articles html", async () => {
    app.get("/", (c) => {
      return c.html(
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
    });
    const text = await renderer(
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
    expect(text.text).toMatchSnapshot();
  });
});
