import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import app from "./index";

describe("Workers application", () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"],
  });
  let DB: D1Database;

  beforeAll(async () => {
    DB = await runtime.getD1Database("DB");
    const sql = await readFile("migrations/0000_quick_vanisher.sql", "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      await DB.prepare(statement.trim()).run();
    }
  });
  afterAll(() => runtime.dispose());

  test("redirects the root to articles", async () => {
    const response = await app.request("/", {}, { DB });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/articles");
  });

  test("serves the article API against D1", async () => {
    const response = await app.request("/api/articles?limit=1", {}, { DB });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test.each([
    "limit=invalid",
    "limit=101",
    "since=invalid",
    "orderField=invalid",
    "minLikes=-1",
    "maxLikes=1.5",
    "minStocks=NaN",
    "maxStocks=9007199254740992",
    "minLikes=2&maxLikes=1",
    "minStocks=2&maxStocks=1",
    `q=${"a".repeat(201)}`,
    `author=${"a".repeat(201)}`,
    `tags=${"a".repeat(101)}`,
    Array.from({ length: 21 }, (_, i) => `tags=${i}`).join("&"),
  ])("preserves formatted validation errors for %s", async (query) => {
    const response = await app.request(`/api/articles?${query}`, {}, { DB });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      title: "Bad Request",
      detail: { _errors: [] },
      status: 400,
    });
  });

  test("filters repeated tags and literal text while retaining Article[] response", async () => {
    await DB.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind("search", "100%_\\", "owner", "Author", "2026-01-01", 0, 2)
      .run();
    await DB.prepare(
      "INSERT INTO tags (article_id, name) VALUES (?, ?), (?, ?), (?, ?)",
    )
      .bind("search", "C#", "search", "a,b", "search", "C#")
      .run();
    try {
      const query = new URLSearchParams({
        q: " %_\\ ",
        author: " Author ",
        minLikes: "0",
        maxLikes: "0",
        minStocks: "2",
        maxStocks: "2",
      });
      query.append("tags", " C# ");
      query.append("tags", "a,b");
      query.append("tags", "C#");
      query.append("tags", "");
      const response = await app.request(`/api/articles?${query}`, {}, { DB });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        {
          id: "search",
          title: "100%_\\",
          userId: "owner",
          userName: "Author",
          createdAt: "2026-01-01",
          likesCount: 0,
          stocksCount: 2,
          tags: [{ name: "C#" }, { name: "a,b" }, { name: "C#" }],
        },
      ]);
      const missing = await app.request(
        "/api/articles?tags=C%23&tags=missing",
        {},
        { DB },
      );
      expect(await missing.json()).toEqual([]);
      const empty = await app.request(
        "/api/articles?minLikes=&maxStocks=&q=&author=&tags=",
        {},
        { DB },
      );
      expect(empty.status).toBe(200);
      expect(await empty.json()).toHaveLength(1);
    } finally {
      await DB.prepare("DELETE FROM tags WHERE article_id = ?")
        .bind("search")
        .run();
      await DB.prepare("DELETE FROM articles WHERE id = ?")
        .bind("search")
        .run();
    }
  });

  test.each([
    ["200 ASCII characters", "Ab".repeat(100), "Cd".repeat(100)],
    [
      "200 Japanese characters",
      "日本語検索".repeat(40),
      "投稿者検索".repeat(40),
    ],
    [
      "200 literal wildcards",
      `${"%_\\".repeat(66)}%_`,
      `${"_%\\".repeat(66)}_%`,
    ],
    [
      "sample full title",
      "AWS CDK で Infrastructure as Code する: Session Manager接続するEC2編",
      "Masatomi KINO",
    ],
  ])(
    "accepts and matches complete title AND author for %s",
    async (_label, q, author) => {
      await DB.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(
          "long-search",
          `prefix ${q} suffix`,
          "other",
          `prefix ${author} suffix`,
          "2026-01-01",
          0,
          2,
        )
        .run();
      await DB.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(
          "long-decoy",
          `${q.slice(0, -1)}!`,
          author,
          "other",
          "2026-01-01",
          0,
          2,
        )
        .run();
      await DB.prepare(
        "INSERT INTO tags (article_id, name) VALUES (?, ?), (?, ?)",
      )
        .bind("long-search", "C#", "long-search", "a,b")
        .run();
      try {
        const params = new URLSearchParams({
          q: q.toLowerCase(),
          author: author.toLowerCase(),
          minLikes: "0",
          maxLikes: "0",
          minStocks: "2",
          maxStocks: "2",
          limit: "1",
        });
        params.append("tags", "C#");
        params.append("tags", "a,b");
        const response = await app.request(
          `/api/articles?${params}`,
          {},
          { DB },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([
          expect.objectContaining({
            id: "long-search",
            title: `prefix ${q} suffix`,
          }),
        ]);
        params.set("offset", "1");
        const next = await app.request(`/api/articles?${params}`, {}, { DB });
        expect(next.status).toBe(200);
        expect(await next.json()).toEqual([]);
        params.delete("offset");
        params.set("author", `${author.slice(0, -1)}!`);
        const mismatch = await app.request(
          `/api/articles?${params}`,
          {},
          { DB },
        );
        expect(mismatch.status).toBe(200);
        expect(await mismatch.json()).toEqual([]);
      } finally {
        await DB.prepare("DELETE FROM tags WHERE article_id = ?")
          .bind("long-search")
          .run();
        await DB.prepare("DELETE FROM articles WHERE id IN (?, ?)")
          .bind("long-search", "long-decoy")
          .run();
      }
    },
  );
  test("API matching folds ASCII but preserves non-ASCII case", async () => {
    await DB.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(
        "case-search",
        "Mixed Ä日本語",
        "WriterID",
        "Ä投稿者",
        "2026-01-01",
        0,
        2,
      )
      .run();
    try {
      for (const [q, author, count] of [
        ["mixed Ä日本語", "writerid", 1],
        ["ä日本語", "writerid", 0],
        ["Mixed", "ä投稿者", 0],
        ["Mixed", "Ä投稿者", 1],
      ] as const) {
        const params = new URLSearchParams({ q, author });
        const response = await app.request(
          `/api/articles?${params}`,
          {},
          { DB },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toHaveLength(count);
      }
    } finally {
      await DB.prepare("DELETE FROM articles WHERE id = ?")
        .bind("case-search")
        .run();
    }
  });

  test.each([
    ["1e2", 100],
    ["1.0", 1],
    ["+2", 2],
    ["0x10", 16],
  ] as const)(
    "normalizes count syntax %s in native SSR bootstrap and controls",
    async (raw, expected) => {
      const response = await app.request(
        `/articles?${new URLSearchParams({ minLikes: raw })}`,
        {},
        { DB },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      const match = html.match(
        /<script id="articles-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
      );
      const bootstrap = JSON.parse(match?.[1] ?? "null");
      expect(bootstrap.config.minLikes).toBe(expected);
      expect(html).toContain(
        `name="minLikes" type="number" min="0" max="9007199254740991" step="1" value="${expected}"`,
      );
    },
  );

  test("publishes OpenAPI with a deployment-relative server", async () => {
    const response = await app.request("/doc", {}, { DB });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      servers: expect.arrayContaining([
        { url: "/", description: "Current deployment" },
      ]),
      paths: { "/api/articles": expect.any(Object) },
    });
  });

  test("documents repeated tags using form/explode parameters", async () => {
    const response = await app.request("/doc", {}, { DB });
    const document = (await response.json()) as {
      paths: { "/api/articles": { get: { parameters: unknown[] } } };
    };
    expect(document.paths["/api/articles"].get.parameters).toContainEqual(
      expect.objectContaining({
        name: "tags",
        in: "query",
        style: "form",
        explode: true,
        schema: expect.objectContaining({ type: "array" }),
      }),
    );
  });
});
