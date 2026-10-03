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
  const generationId = "test-generation";

  beforeAll(async () => {
    const binding = await runtime.getD1Database("DB");
    // Create versioned schema
    await binding.exec(
      "CREATE TABLE `data_generations` (`id` text PRIMARY KEY NOT NULL, `state` text NOT NULL, `created_at` text NOT NULL, `published_sequence` integer, `article_count` integer, `tag_count` integer);",
    );
    await binding.exec(
      "CREATE TABLE `generation_articles` (`generation_id` text NOT NULL, `id` text NOT NULL, `title` text NOT NULL, `user_id` text NOT NULL, `user_name` text NOT NULL, `created_at` text NOT NULL, `likes_count` integer NOT NULL, `stocks_count` integer NOT NULL, PRIMARY KEY(`generation_id`, `id`));",
    );
    await binding.exec(
      "CREATE TABLE `generation_tags` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `generation_id` text NOT NULL, `article_id` text NOT NULL, `name` text NOT NULL, `position` integer NOT NULL);",
    );

    // Insert published generation
    await binding
      .prepare(
        "INSERT INTO `data_generations` (`id`, `state`, `created_at`, `published_sequence`) VALUES (?, ?, ?, ?)",
      )
      .bind(generationId, "published", "2026-10-03T00:00:00Z", 1)
      .run();

    db = drizzle(binding, { schema });
    await db.insert(schema.generationArticles).values([
      {
        generationId,
        id: "a",
        title: "100%_\\ literal",
        userId: "alice",
        userName: "A%_\\",
        createdAt: "2026-01-01",
        likesCount: 0,
        stocksCount: 2,
      },
      {
        generationId,
        id: "b",
        title: "100xx literal",
        userId: "bob",
        userName: "Alice",
        createdAt: "2026-01-02",
        likesCount: 10,
        stocksCount: 20,
      },
      {
        generationId,
        id: "c",
        title: "Other",
        userId: "carol",
        userName: "Carol",
        createdAt: "2026-01-03",
        likesCount: 11,
        stocksCount: 21,
      },
    ]);
    await db.insert(schema.generationTags).values([
      { generationId, articleId: "a", name: "C#", position: 0 },
      { generationId, articleId: "a", name: "C#", position: 1 },
      { generationId, articleId: "a", name: "a,b", position: 2 },
      { generationId, articleId: "b", name: "C#", position: 0 },
      { generationId, articleId: "c", name: "z", position: 0 },
    ]);
  });
  afterAll(() => runtime.dispose());
  const search = (filters: Partial<FindAllArticlesConfig>) =>
    findAllArticles(db, generationId, {
      limit: 100,
      offset: 0,
      since: null,
      until: null,
      ...filters,
    });

  test("sorted distinct options preserve punctuation", async () => {
    expect(await findArticleTags(db, generationId)).toEqual(["C#", "a,b", "z"]);
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
