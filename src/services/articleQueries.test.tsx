import type {
  findAllArticles,
  findArticleTags,
  FindAllArticlesConfig,
} from "@/db";
import { ArticlesPage } from "@/pages/articles";
import { renderer } from "@/util/testUtils";
import { loadArticles, loadArticlesPageData } from "./articleQueries";

const config: FindAllArticlesConfig = {
  limit: null,
  offset: null,
  since: null,
  until: null,
  q: " title ",
  tags: ["unknown", " C# ", "C#"],
  minLikes: 0,
};
const db = {} as Parameters<typeof findAllArticles>[0];
const articles = [
  {
    id: "a",
    title: "title",
    userId: "writer",
    userName: "Writer",
    createdAt: "2026-01-01T00:00:00Z",
    likesCount: 1,
    stocksCount: 0,
    tags: [{ name: "C#" }],
  },
];

it("uses the same normalized search for API rows, native rows and bootstrap", async () => {
  const findRows: typeof findAllArticles = vi.fn(async () => articles);
  const findTags: typeof findArticleTags = vi.fn(async () => ["known", "C#"]);
  const source = { findAllArticles: findRows, findArticleTags: findTags };
  const api = await loadArticles(db, config, "v1", source);
  const page = await loadArticlesPageData(db, config, "v1", 7, source);
  expect(page.config).toEqual(api.config);
  expect(page.articles).toEqual(api.articles);
  expect(findRows).toHaveBeenNthCalledWith(1, db, "v1", {
    ...api.config,
    since: null,
    until: null,
  });
  expect(findRows).toHaveBeenNthCalledWith(
    2,
    ...vi.mocked(findRows).mock.calls[0],
  );
  expect(findTags).toHaveBeenCalledExactlyOnceWith(db, "v1");
  expect(page).toMatchObject({
    config: {
      limit: 10,
      offset: 0,
      q: "title",
      tags: ["C#", "unknown"],
      minLikes: 0,
    },
    tagOptions: ["C#", "known", "unknown"],
    dataVersion: "v1",
    publishedSequence: 7,
  });

  // Rendering receives plain data and cannot issue additional database reads.
  const { text } = await renderer(<ArticlesPage {...page} />);
  expect(findRows).toHaveBeenCalledTimes(2);
  expect(findTags).toHaveBeenCalledTimes(1);
  const bootstrap = JSON.parse(
    text.match(
      /<script id="articles-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
    )?.[1] ?? "null",
  );
  expect(bootstrap).toEqual(page);
  expect(text).toContain('value="unknown" selected');
  expect(text).toContain("title</a>");
});

it("rejects invalid search ranges before reading articles or tags", async () => {
  const source = { findAllArticles: vi.fn(), findArticleTags: vi.fn() };
  await expect(
    loadArticlesPageData(
      db,
      {
        ...config,
        minLikes: 5,
        maxLikes: 1,
      },
      "v1",
      7,
      source,
    ),
  ).rejects.toThrow();
  expect(source.findAllArticles).not.toHaveBeenCalled();
  expect(source.findArticleTags).not.toHaveBeenCalled();
});

it("propagates a failed row read without returning a partial page", async () => {
  const error = new Error("generation unavailable");
  const source = {
    findAllArticles: vi.fn(async () => {
      throw error;
    }),
    findArticleTags: vi.fn(),
  };
  await expect(loadArticlesPageData(db, config, "v1", 7, source)).rejects.toBe(
    error,
  );
  expect(source.findArticleTags).not.toHaveBeenCalled();
});
