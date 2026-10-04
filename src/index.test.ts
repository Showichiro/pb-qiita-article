import {
  migrateTestGeneration,
  refreshTestGeneration,
} from "./db/test-generation";
import { readFile } from "node:fs/promises";
import {
  addUtcDays,
  resolveTimeSeriesWindow,
  timeSeriesBucketStarts,
} from "@/schemas";
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
    await migrateTestGeneration(DB);
    await refreshTestGeneration(DB);
    await DB.prepare(
      "INSERT INTO active_data_generation VALUES (1,'legacy',1)",
    ).run();
  });
  const request = async (...args: Parameters<typeof app.request>) => {
    if (args[2] && "DB" in args[2] && args[2].DB === DB)
      await refreshTestGeneration(DB);
    return app.request(...args);
  };
  afterAll(() => runtime.dispose());

  test("redirects the root to articles", async () => {
    const response = await request("/", {}, { DB });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/articles");
  });

  test("serves the article API against D1", async () => {
    const response = await request("/api/articles?limit=1", {}, { DB });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("serves the native analysis page with a 90-day UTC bootstrap", async () => {
    const response = await request("/analysis", {}, { DB });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="analysis-app"');
    expect(html).toContain('action="/analysis" method="get"');
    expect(html).toContain('href="/analysis"');
    expect(html).toContain('data-focus-id="analysis-auto-search"');
    expect(html).toContain('data-focus-id="analysis-tag-clear"');
    const match = html.match(
      /<script id="analysis-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
    );
    const bootstrap = JSON.parse(match?.[1] ?? "null");
    expect(bootstrap.state).toMatchObject({
      since: addUtcDays(bootstrap.state.until, -89),
      bucket: "day",
      author: "",
      tags: [],
      metric: "posts",
      view: "table",
    });
    expect(bootstrap.rows).toHaveLength(90);
  });

  test("renders a full native GET analysis state and clear-tags URL", async () => {
    const response = await request(
      "/analysis?since=2026-01-01&until=2026-01-03&bucket=week&author=Writer&tags=unknown&metric=likes&view=chart",
      {},
      { DB },
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    const match = html.match(
      /<script id="analysis-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
    );
    const bootstrap = JSON.parse(match?.[1] ?? "null");
    expect(bootstrap.state).toEqual({
      since: "2026-01-01",
      until: "2026-01-03",
      bucket: "week",
      author: "Writer",
      tags: ["unknown"],
      metric: "likes",
      view: "chart",
    });
    expect(
      bootstrap.rows.map((row: { bucketStart: string }) => row.bucketStart),
    ).toEqual(["2025-12-29"]);
    expect(html).toContain('value="unknown" selected');
    expect(html).toContain("h-[320px]");
    expect(html).toContain("公開記事の現在のいいね数");
    const clear = html.match(
      /<a href="([^"]+)"[^>]*data-focus-id="analysis-tag-clear"/,
    );
    const clearUrl = new URL(
      (clear?.[1] ?? "").replaceAll("&amp;", "&"),
      "https://local",
    );
    expect(clearUrl.pathname).toBe("/analysis");
    expect(clearUrl.searchParams.has("tags")).toBe(false);
    expect(clearUrl.searchParams.get("author")).toBe("Writer");
    expect(clearUrl.searchParams.get("bucket")).toBe("week");
    expect(clearUrl.searchParams.get("metric")).toBe("likes");
    expect(clearUrl.searchParams.get("view")).toBe("chart");
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
    const response = await request(`/api/articles?${query}`, {}, { DB });
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
      const response = await request(`/api/articles?${query}`, {}, { DB });
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
      const missing = await request(
        "/api/articles?tags=C%23&tags=missing",
        {},
        { DB },
      );
      expect(await missing.json()).toEqual([]);
      const empty = await request(
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
        const response = await request(`/api/articles?${params}`, {}, { DB });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([
          expect.objectContaining({
            id: "long-search",
            title: `prefix ${q} suffix`,
          }),
        ]);
        params.set("offset", "1");
        const next = await request(`/api/articles?${params}`, {}, { DB });
        expect(next.status).toBe(200);
        expect(await next.json()).toEqual([]);
        params.delete("offset");
        params.set("author", `${author.slice(0, -1)}!`);
        const mismatch = await request(`/api/articles?${params}`, {}, { DB });
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
        const response = await request(`/api/articles?${params}`, {}, { DB });
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
      const response = await request(
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
    const response = await request("/doc", {}, { DB });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      servers: expect.arrayContaining([
        { url: "/", description: "Current deployment" },
      ]),
      paths: { "/api/articles": expect.any(Object) },
    });
  });

  test("documents repeated tags using form/explode parameters", async () => {
    const response = await request("/doc", {}, { DB });
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

  test("rejects time series query errors before reading D1", async () => {
    let reads = 0;
    const unread = new Proxy({} as D1Database, {
      get(_target, property) {
        if (property === "then") return undefined;
        reads += 1;
        throw new Error(`D1 was read via ${String(property)}`);
      },
    });
    const cases = [
      "since=2026-02-31",
      "since=0000-01-01",
      "since=2023-02-29",
      "since=1900-02-29",
      "until=2026-01-01T00:00:00Z",
      "since=2026-01-02&until=2026-01-01",
      "bucket=year",
      `author=${"a".repeat(201)}`,
      `tags=${"a".repeat(101)}`,
      Array.from({ length: 21 }, (_, index) => `tags=t${index}`).join("&"),
      `since=2020-01-01&until=${addUtcDays("2020-01-01", 400)}&bucket=day`,
      `since=2020-01-01&until=${addUtcDays("2020-01-01", 3660)}&bucket=month`,
      `since=2020-01-06&until=${addUtcDays("2020-01-06", 400 * 7)}&bucket=week`,
      "until=0001-03-30",
    ];
    for (const query of cases) {
      const response = await request(
        `/api/analysis/time-series?${query}`,
        {},
        { DB: unread },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        title: "Bad Request",
        status: 400,
        detail: { _errors: [] },
      });
    }
    expect(reads).toBe(0);
    const invalidDate = await request(
      "/api/analysis/time-series?since=2026-02-31",
      {},
      { DB: unread },
    );
    expect(await invalidDate.json()).toEqual({
      title: "Bad Request",
      status: 400,
      detail: {
        _errors: [],
        since: { _errors: ["since must be a real Japan calendar date (YYYY-MM-DD)"] },
      },
    });
  });

  test("returns the default UTC window and the day sample through the API", async () => {
    const stored = await DB.prepare(
      "SELECT count(*) AS articleCount FROM articles",
    ).first<{ articleCount: number }>();
    const response = await request("/api/analysis/time-series", {}, { DB });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      since: string;
      until: string;
      bucket: string;
      rows: Array<{
        bucketStart: string;
        articleCount: number;
        publishedArticleLikes: number;
      }>;
    };
    expect(body.bucket).toBe("day");
    expect(resolveTimeSeriesWindow({ bucket: "day" })).toMatchObject({
      ok: true,
      since: body.since,
      until: body.until,
      bucket: "day",
    });
    expect(body.since).toBe(addUtcDays(body.until, -89));
    expect(body.rows.map((row) => row.bucketStart)).toEqual(
      timeSeriesBucketStarts(body.since, body.until, "day"),
    );
    if (stored?.articleCount === 0) {
      expect(body.rows.every((row) => row.articleCount === 0)).toBe(true);
      expect(body.rows.every((row) => row.publishedArticleLikes === 0)).toBe(
        true,
      );
    }

    const until = addUtcDays("2020-01-01", 399);
    const capped = await request(
      `/api/analysis/time-series?since=2020-01-01&until=${until}&bucket=day`,
      {},
      { DB },
    );
    expect(capped.status).toBe(200);
    const cappedBody = (await capped.json()) as {
      rows: Array<{ bucketStart: string }>;
    };
    expect(cappedBody.rows).toHaveLength(400);
    expect(cappedBody.rows[0]?.bucketStart).toBe("2020-01-01");
    expect(cappedBody.rows[399]?.bucketStart).toBe(until);

    await DB.prepare(
      "INSERT INTO articles (id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "ts-day-offset",
        "ts-day-offset",
        "WriterID",
        "Writer",
        "2025-12-31T23:30:00-05:00",
        2,
        0,
        "ts-day-before",
        "ts-day-before",
        "WriterID",
        "Writer",
        "2026-01-01T00:30:00+09:00",
        9,
        0,
        "ts-day-end",
        "ts-day-end",
        "WriterID",
        "Writer",
        "2026-01-03T23:59:59+09:00",
        5,
        0,
        "ts-day-next",
        "ts-day-next",
        "WriterID",
        "Writer",
        "2026-01-04T00:00:00+09:00",
        7,
        0,
      )
      .run();
    try {
      const sample = await request(
        "/api/analysis/time-series?since=2026-01-01&until=2026-01-03&bucket=day",
        {},
        { DB },
      );
      expect(sample.status).toBe(200);
      expect(await sample.json()).toEqual({
        since: "2026-01-01",
        until: "2026-01-03",
        bucket: "day",
        rows: [
          {
            bucketStart: "2026-01-01",
            articleCount: 2,
            publishedArticleLikes: 11,
          },
          {
            bucketStart: "2026-01-02",
            articleCount: 0,
            publishedArticleLikes: 0,
          },
          {
            bucketStart: "2026-01-03",
            articleCount: 1,
            publishedArticleLikes: 5,
          },
        ],
      });
    } finally {
      await DB.prepare("DELETE FROM articles WHERE id IN (?, ?, ?, ?)")
        .bind("ts-day-offset", "ts-day-before", "ts-day-end", "ts-day-next")
        .run();
    }
  });

  test("keeps the earliest supported Monday bucket serializable", async () => {
    const response = await request(
      "/api/analysis/time-series?since=0001-01-01&until=0001-01-01&bucket=week",
      {},
      { DB },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      since: "0001-01-01",
      until: "0001-01-01",
      bucket: "week",
      rows: [
        {
          bucketStart: "0001-01-01",
          articleCount: 0,
          publishedArticleLikes: 0,
        },
      ],
    });
  });

  test("applies repeated exact tags through the time series route", async () => {
    await DB.prepare(
      "INSERT INTO articles (id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "ts-both",
        "ts-both",
        "owner",
        "Owner",
        "2026-06-01T00:00:00Z",
        4,
        0,
        "ts-one",
        "ts-one",
        "owner",
        "Owner",
        "2026-06-01T01:00:00Z",
        9,
        0,
      )
      .run();
    await DB.prepare(
      "INSERT INTO tags (article_id, name) VALUES (?, ?), (?, ?), (?, ?)",
    )
      .bind("ts-both", "Go", "ts-both", "Rust", "ts-one", "Go")
      .run();
    try {
      const params = new URLSearchParams({
        since: "2026-06-01",
        until: "2026-06-01",
        bucket: "day",
      });
      params.append("tags", "Rust");
      params.append("tags", "Go");
      const response = await request(
        `/api/analysis/time-series?${params}`,
        {},
        { DB },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        since: "2026-06-01",
        until: "2026-06-01",
        bucket: "day",
        rows: [
          {
            bucketStart: "2026-06-01",
            articleCount: 1,
            publishedArticleLikes: 4,
          },
        ],
      });
    } finally {
      await DB.prepare("DELETE FROM tags WHERE article_id IN (?, ?)")
        .bind("ts-both", "ts-one")
        .run();
      await DB.prepare("DELETE FROM articles WHERE id IN (?, ?)")
        .bind("ts-both", "ts-one")
        .run();
    }
  });

  test("publishes the time series operation", async () => {
    const response = await request("/doc", {}, { DB });
    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      paths: {
        "/api/analysis/time-series": {
          get: {
            responses: { "200": { description: string } };
            parameters: unknown[];
          };
        };
      };
    };
    expect(
      document.paths["/api/analysis/time-series"].get.responses["200"]
        .description,
    ).toContain("current likes_count snapshot");
    expect(
      document.paths["/api/analysis/time-series"].get.parameters,
    ).toContainEqual(
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
