import { readFile } from "node:fs/promises";
import { drizzle } from "@/lib";
import { Miniflare } from "miniflare";
import { findAllArticles, findArticleTags, schema } from "@/db";
import type { FindAllArticlesConfig } from "@/db";

describe("article search on D1", () => {
  const runtime = new Miniflare({
    modules: true,
    d1Databases: ["DB"],
    script: "export default { fetch() { return new Response('ok'); } };",
  });
  let db: ReturnType<typeof drizzle<typeof schema>>;
  beforeAll(async () => {
    const binding = await runtime.getD1Database("DB");
    for (const statement of (
      await readFile("migrations/0000_quick_vanisher.sql", "utf8")
    ).split("--> statement-breakpoint")) {
      await binding.prepare(statement.trim()).run();
    }
    db = drizzle(binding, { schema });
    await db.insert(schema.articles).values([
      {
        id: "a",
        title: "100%_\\ literal",
        userId: "alice",
        userName: "A%_\\",
        createdAt: "2026-01-01",
        likesCount: 0,
        stocksCount: 2,
      },
      {
        id: "b",
        title: "100xx literal",
        userId: "bob",
        userName: "Alice",
        createdAt: "2026-01-02",
        likesCount: 10,
        stocksCount: 20,
      },
      {
        id: "c",
        title: "Other",
        userId: "carol",
        userName: "Carol",
        createdAt: "2026-01-03",
        likesCount: 11,
        stocksCount: 21,
      },
    ]);
    await db.insert(schema.tags).values([
      { articleId: "a", name: "C#" },
      { articleId: "a", name: "C#" },
      { articleId: "a", name: "a,b" },
      { articleId: "b", name: "C#" },
      { articleId: "c", name: "z" },
    ]);
  });
  afterAll(() => runtime.dispose());
  const search = (filters: Partial<FindAllArticlesConfig>) =>
    findAllArticles(db, {
      limit: 100,
      offset: 0,
      since: null,
      until: null,
      ...filters,
    });

  test("sorted distinct options preserve punctuation", async () => {
    expect(await findArticleTags(db)).toEqual(["C#", "a,b", "z"]);
  });
  test.each(["%", "_", "\\", "%_\\", " 100%_\\ "])(
    "title substring treats %s literally",
    async (q) => {
      expect((await search({ q })).map(({ id }) => id)).toEqual(["a"]);
    },
  );
  test("author matches either id or display name", async () => {
    expect((await search({ author: " alice " })).map(({ id }) => id)).toEqual([
      "b",
      "a",
    ]);
  });
  test.each(["%", "_", "\\"])("author treats %s literally", async (author) => {
    expect((await search({ author })).map(({ id }) => id)).toEqual(["a"]);
  });
  test("requires all exact tags and avoids duplicate article rows", async () => {
    const rows = await search({ tags: [" C# ", "a,b", "C#", ""] });
    expect(rows.map(({ id }) => id)).toEqual(["a"]);
    expect(rows[0].tags).toEqual([
      { name: "C#" },
      { name: "C#" },
      { name: "a,b" },
    ]);
    expect(await search({ tags: ["C"] })).toEqual([]);
    expect(await search({ tags: ["C#", "z"] })).toEqual([]);
  });
  test("composes search, date and inclusive count filters before pagination", async () => {
    expect(
      (
        await search({
          q: "literal",
          author: "alice",
          tags: ["C#"],
          minLikes: 0,
          maxLikes: 10,
          minStocks: 2,
          maxStocks: 20,
          since: "2026-01-01",
          until: "2026-01-02",
          orderField: "likesCount",
          orderDirection: "asc",
          limit: 1,
          offset: 1,
        })
      ).map(({ id }) => id),
    ).toEqual(["b"]);
    expect(
      (
        await search({ minLikes: 0, maxLikes: 0, minStocks: 2, maxStocks: 2 })
      ).map(({ id }) => id),
    ).toEqual(["a"]);
  });
  test.each([
    [{ minLikes: 11 }, ["c"]],
    [{ maxLikes: 10 }, ["b", "a"]],
    [{ minStocks: 21 }, ["c"]],
    [{ maxStocks: 20 }, ["b", "a"]],
  ])("supports independent bounds %j", async (filters, ids) => {
    expect((await search(filters)).map(({ id }) => id)).toEqual(ids);
  });
  test("binds hostile text and ignores empty fields", async () => {
    expect(await search({ q: "' OR 1=1 --" })).toEqual([]);
    expect(
      (await search({ q: " ", author: " ", tags: [""] })).map(({ id }) => id),
    ).toEqual(["c", "b", "a"]);
  });
});
