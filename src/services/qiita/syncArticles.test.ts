import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { type Article, fetchQiitaArticles } from "./fetchArticles";
import {
  diffArticles,
  readCurrentArticles,
  syncArticles,
} from "./syncArticles";

const article: Article = {
  id: "one",
  title: "Bob's article",
  userId: "bob",
  userName: "Bob",
  createdAt: "2026-01-01T00:00:00Z",
  likesCount: 1,
  stocksCount: 2,
  tags: ["TypeScript", "SQL"],
};
const item = (value: Article) => ({
  id: value.id,
  title: value.title,
  user: { id: value.userId, name: value.userName },
  created_at: value.createdAt,
  likes_count: value.likesCount,
  stocks_count: value.stocksCount,
  tags: value.tags.map((name) => ({ name })),
});
const response = (values: Article[], total = values.length) =>
  new Response(JSON.stringify(values.map(item)), {
    headers: { "Total-Count": String(total) },
  });
const requestFor = (values: Article[]) =>
  vi.fn<typeof fetch>().mockResolvedValue(response(values));

test("diff separates record changes from tag sets and ignores tag order", () => {
  expect(
    diffArticles(
      [article],
      [{ ...article, tags: ["SQL", "TypeScript", "SQL"] }],
    ),
  ).toEqual({ inserted: [], updated: [], tagsChanged: [], deleted: [] });
  for (const field of [
    "title",
    "userId",
    "userName",
    "createdAt",
    "likesCount",
    "stocksCount",
  ] as const) {
    const changed = {
      ...article,
      [field]: typeof article[field] === "number" ? 9 : "changed",
    };
    expect(diffArticles([article], [changed]).updated).toEqual([changed]);
    expect(diffArticles([article], [changed]).tagsChanged).toEqual([]);
  }
  expect(
    diffArticles([article], [{ ...article, tags: [] }]).tagsChanged,
  ).toHaveLength(1);
  expect(diffArticles([article], [])).toMatchObject({ deleted: [article] });
});

test("fetches all pages and validates completion", async () => {
  const first = Array.from({ length: 100 }, (_, n) => ({
    ...article,
    id: String(n),
  }));
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response(first, 101))
    .mockResolvedValueOnce(response([article], 101));
  expect(await fetchQiitaArticles("token", request)).toHaveLength(101);
  expect(String(request.mock.calls[1][0])).toContain("page=2");
  expect(String(request.mock.calls[0][0])).toContain("org%3Aprimebrains");
  const duplicate = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response(first, 101))
    .mockResolvedValueOnce(response([first[0]], 101));
  await expect(fetchQiitaArticles("token", duplicate)).rejects.toThrow(
    "Duplicate",
  );
  await expect(
    fetchQiitaArticles(
      "token",
      vi.fn<typeof fetch>().mockResolvedValue(response([], 1)),
    ),
  ).rejects.toThrow("Incomplete");
  await expect(fetchQiitaArticles("", request)).rejects.toThrow("not set");
  await expect(
    fetchQiitaArticles(
      "token",
      vi.fn<typeof fetch>().mockResolvedValue(new Response("[{}]")),
    ),
  ).rejects.toThrow();
});

describe("D1 differential sync", () => {
  const runtime = new Miniflare({
    modules: true,
    d1Databases: ["DB"],
    script: "export default { fetch() { return new Response('ok'); } };",
  });
  let db: D1Database;
  beforeAll(async () => {
    db = await runtime.getD1Database("DB");
    for (const sql of (
      await readFile("migrations/0000_quick_vanisher.sql", "utf8")
    ).split("--> statement-breakpoint")) {
      await db.prepare(sql.trim()).run();
    }
  });
  beforeEach(async () => {
    await db.prepare("DELETE FROM articles").run();
  });
  afterAll(() => runtime.dispose());

  test("inserts safely, skips unchanged rows, updates counts, replaces tags and cascades deletions", async () => {
    expect(
      await syncArticles(db, "token", requestFor([article])),
    ).toMatchObject({ inserted: 1, statements: 3 });
    const initialTags = await db.prepare("SELECT * FROM tags").all();
    expect(
      await syncArticles(db, "token", requestFor([article])),
    ).toMatchObject({ statements: 0 });
    const changed = { ...article, likesCount: 9, stocksCount: 10 };
    expect(
      await syncArticles(db, "token", requestFor([changed])),
    ).toMatchObject({ updated: 1, tagsChanged: 0, statements: 1 });
    expect((await db.prepare("SELECT * FROM tags").all()).results).toEqual(
      initialTags.results,
    );
    const tagged = { ...changed, tags: ["O'Reilly"] };
    expect(await syncArticles(db, "token", requestFor([tagged]))).toMatchObject(
      { updated: 0, tagsChanged: 1, statements: 2 },
    );
    expect(await readCurrentArticles(db)).toEqual([tagged]);
    expect(await syncArticles(db, "token", requestFor([]))).toMatchObject({
      deleted: 1,
      statements: 1,
    });
    expect((await db.prepare("SELECT * FROM tags").all()).results).toEqual([]);
  });

  test.each(["http", "network", "invalid", "total"])(
    "page two %s failure leaves the database untouched",
    async (failure) => {
      await syncArticles(db, "token", requestFor([article]));
      const first = Array.from({ length: 100 }, (_, n) => ({
        ...article,
        id: String(n),
      }));
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(first, 101));
      if (failure === "network")
        request.mockRejectedValueOnce(new Error("network"));
      else
        request.mockResolvedValueOnce(
          failure === "http"
            ? new Response("error", { status: 500 })
            : failure === "invalid"
              ? new Response("[{}]")
              : response([article], 102),
        );
      await expect(syncArticles(db, "token", request)).rejects.toThrow();
      expect(await readCurrentArticles(db)).toEqual(
        [{ ...article, tags: [...article.tags].sort() }],
      );
    },
  );
});
