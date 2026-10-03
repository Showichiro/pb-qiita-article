import { migrateTestGeneration } from "./test-generation";
import { readFile } from "node:fs/promises";
import { getArticleTimeSeries, schema } from "@/db";
import { drizzle } from "@/lib";
import { Miniflare } from "miniflare";

describe("getArticleTimeSeries", () => {
  const runtime = new Miniflare({
    modules: true,
    d1Databases: ["DB"],
    script: "export default { fetch() { return new Response('ok'); } };",
  });
  let d1: D1Database;

  beforeAll(async () => {
    d1 = await runtime.getD1Database("DB");
    const migration = await readFile(
      "migrations/0000_quick_vanisher.sql",
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      await d1.prepare(statement.trim()).run();
    }
    await migrateTestGeneration(d1);
    await d1
      .prepare(
        "UPDATE data_generations SET state='published',published_sequence=1 WHERE id='legacy'",
      )
      .run();
  });
  afterAll(() => runtime.dispose());
  beforeEach(async () => {
    await d1.exec("DELETE FROM generation_tags");
    await d1.exec("DELETE FROM generation_articles");
  });

  const database = () => drizzle(d1, { schema });

  const insertArticle = async (article: {
    id: string;
    createdAt: string;
    likes: number;
    userId?: string;
    userName?: string;
    tags?: string[];
  }) => {
    await d1
      .prepare(
        "INSERT INTO generation_articles (generation_id, id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES ('legacy', ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        article.id,
        article.id,
        article.userId ?? "WriterID",
        article.userName ?? "Writer",
        article.createdAt,
        article.likes,
        0,
      )
      .run();
    for (const [position, tag] of (article.tags ?? []).entries()) {
      await d1
        .prepare(
          "INSERT INTO generation_tags (generation_id, article_id, name, position) VALUES ('legacy', ?, ?, ?)",
        )
        .bind(article.id, tag, position)
        .run();
    }
  };

  test("zero-fills every selected day when nothing matches", async () => {
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2026-03-01",
        until: "2026-03-02",
        bucket: "day",
      }),
    ).resolves.toEqual({
      since: "2026-03-01",
      until: "2026-03-02",
      bucket: "day",
      rows: [
        {
          bucketStart: "2026-03-01",
          articleCount: 0,
          publishedArticleLikes: 0,
        },
        {
          bucketStart: "2026-03-02",
          articleCount: 0,
          publishedArticleLikes: 0,
        },
      ],
    });
  });

  test("counts the contract day sample on UTC dates, not raw ISO prefixes", async () => {
    await insertArticle({
      id: "day-offset",
      createdAt: "2025-12-31T23:30:00-05:00",
      likes: 2,
    });
    await insertArticle({
      id: "day-before",
      createdAt: "2026-01-01T00:30:00+09:00",
      likes: 9,
    });
    await insertArticle({
      id: "day-end",
      createdAt: "2026-01-03T23:59:59Z",
      likes: 5,
    });
    await insertArticle({
      id: "day-next",
      createdAt: "2026-01-04T00:00:00Z",
      likes: 7,
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2026-01-01",
        until: "2026-01-03",
        bucket: "day",
      }),
    ).resolves.toEqual({
      since: "2026-01-01",
      until: "2026-01-03",
      bucket: "day",
      rows: [
        {
          bucketStart: "2026-01-01",
          articleCount: 1,
          publishedArticleLikes: 2,
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
  });

  test("places a stored +09:00 timestamp on its UTC date", async () => {
    await insertArticle({
      id: "qiita",
      createdAt: "2025-05-07T08:36:24+09:00",
      likes: 11,
    });
    const onPreviousDay = await getArticleTimeSeries(database(), "legacy", {
      since: "2025-05-06",
      until: "2025-05-06",
      bucket: "day",
    });
    const onPrefixDay = await getArticleTimeSeries(database(), "legacy", {
      since: "2025-05-07",
      until: "2025-05-07",
      bucket: "day",
    });
    expect(onPreviousDay.rows).toEqual([
      { bucketStart: "2025-05-06", articleCount: 1, publishedArticleLikes: 11 },
    ]);
    expect(onPrefixDay.rows).toEqual([
      { bucketStart: "2025-05-07", articleCount: 0, publishedArticleLikes: 0 },
    ]);
  });

  test("aggregates Monday weeks across the year boundary", async () => {
    await insertArticle({
      id: "before-since",
      createdAt: "2025-12-30T12:00:00Z",
      likes: 9,
    });
    await insertArticle({
      id: "week-start",
      createdAt: "2026-01-01T00:00:00Z",
      likes: 1,
    });
    await insertArticle({
      id: "offset-into-range",
      createdAt: "2025-12-31T23:30:00-05:00",
      likes: 3,
    });
    await insertArticle({
      id: "late-first-week",
      createdAt: "2026-01-04T23:00:00+09:00",
      likes: 4,
    });
    await insertArticle({
      id: "next-monday",
      createdAt: "2026-01-05T00:00:00Z",
      likes: 2,
    });
    await insertArticle({
      id: "until-end",
      createdAt: "2026-01-10T23:59:59Z",
      likes: 8,
    });
    await insertArticle({
      id: "after-until",
      createdAt: "2026-01-11T00:00:00Z",
      likes: 100,
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2026-01-01",
        until: "2026-01-10",
        bucket: "week",
      }),
    ).resolves.toEqual({
      since: "2026-01-01",
      until: "2026-01-10",
      bucket: "week",
      rows: [
        {
          bucketStart: "2025-12-29",
          articleCount: 3,
          publishedArticleLikes: 8,
        },
        {
          bucketStart: "2026-01-05",
          articleCount: 2,
          publishedArticleLikes: 10,
        },
      ],
    });
  });

  test("aggregates leap February and a shifted March timestamp", async () => {
    await insertArticle({
      id: "before-month",
      createdAt: "2024-02-14T23:59:59Z",
      likes: 20,
    });
    await insertArticle({
      id: "leap-day",
      createdAt: "2024-02-29T23:00:00+09:00",
      likes: 6,
    });
    await insertArticle({
      id: "march-prefix-still-february",
      createdAt: "2024-03-01T00:30:00+09:00",
      likes: 1,
    });
    await insertArticle({
      id: "march-utc",
      createdAt: "2024-03-01T00:00:00Z",
      likes: 4,
    });
    await insertArticle({
      id: "after-month",
      createdAt: "2024-03-02T00:00:00Z",
      likes: 30,
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2024-02-15",
        until: "2024-03-01",
        bucket: "month",
      }),
    ).resolves.toEqual({
      since: "2024-02-15",
      until: "2024-03-01",
      bucket: "month",
      rows: [
        {
          bucketStart: "2024-02-01",
          articleCount: 2,
          publishedArticleLikes: 7,
        },
        {
          bucketStart: "2024-03-01",
          articleCount: 1,
          publishedArticleLikes: 4,
        },
      ],
    });
  });

  test("counts an article once for exact AND tags and a literal author", async () => {
    await insertArticle({
      id: "both-tags",
      createdAt: "2026-05-01T01:00:00Z",
      likes: 4,
      userId: "WriterID",
      userName: "Someone",
      tags: ["Go", "Rust", "Go"],
    });
    await insertArticle({
      id: "name-substring",
      createdAt: "2026-05-01T02:00:00Z",
      likes: 6,
      userId: "other",
      userName: "prefix WriterID suffix",
      tags: ["Go", "Rust"],
    });
    await insertArticle({
      id: "non-ascii-name",
      createdAt: "2026-05-01T03:00:00Z",
      likes: 1,
      userId: "Reader",
      userName: "Ä投稿者",
      tags: ["Go", "Rust"],
    });
    await insertArticle({
      id: "missing-tag",
      createdAt: "2026-05-01T04:00:00Z",
      likes: 10,
      userId: "WriterID",
      tags: ["Go"],
    });
    await insertArticle({
      id: "wildcard-decoy",
      createdAt: "2026-05-01T05:00:00Z",
      likes: 3,
      userId: "Xadmin",
      userName: "Literal",
      tags: ["Go", "Rust"],
    });
    await insertArticle({
      id: "literal-author",
      createdAt: "2026-05-01T06:00:00Z",
      likes: 8,
      userId: "%_admin",
      userName: "Literal",
      tags: ["Go", "Rust"],
    });
    const config = {
      since: "2026-05-01",
      until: "2026-05-01",
      bucket: "day" as const,
      tags: ["Rust", "Go"],
    };
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        ...config,
        author: "writerid",
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          bucketStart: "2026-05-01",
          articleCount: 2,
          publishedArticleLikes: 10,
        },
      ],
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        ...config,
        author: "ä投稿者",
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          bucketStart: "2026-05-01",
          articleCount: 0,
          publishedArticleLikes: 0,
        },
      ],
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        ...config,
        author: "Ä投稿者",
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          bucketStart: "2026-05-01",
          articleCount: 1,
          publishedArticleLikes: 1,
        },
      ],
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        ...config,
        author: "%_admin",
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          bucketStart: "2026-05-01",
          articleCount: 1,
          publishedArticleLikes: 8,
        },
      ],
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", config),
    ).resolves.toMatchObject({
      rows: [
        {
          bucketStart: "2026-05-01",
          articleCount: 5,
          publishedArticleLikes: 22,
        },
      ],
    });
  });

  test("ignores an unparsable offset and treats a zoneless timestamp as UTC", async () => {
    await d1
      .prepare(
        "INSERT INTO generation_articles (generation_id, id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES ('legacy', ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        "bad-offset",
        "bad-offset",
        "u",
        "n",
        "2026-04-01T00:00:00+0900",
        5,
        0,
      )
      .run();
    await insertArticle({
      id: "utc-midnight",
      createdAt: "2026-04-01T00:00:00Z",
      likes: 2,
    });
    await insertArticle({
      id: "zoneless",
      createdAt: "2026-04-02 23:30:00",
      likes: 3,
    });
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2026-04-01",
        until: "2026-04-02",
        bucket: "day",
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          bucketStart: "2026-04-01",
          articleCount: 1,
          publishedArticleLikes: 2,
        },
        {
          bucketStart: "2026-04-02",
          articleCount: 1,
          publishedArticleLikes: 3,
        },
      ],
    });
  });

  test("accepts the maximum safe like total and rejects an unsafe snapshot sum", async () => {
    await d1.exec(
      "INSERT INTO generation_articles (generation_id, id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES ('legacy', 'max-safe', 'max-safe', 'u', 'n', '2026-08-01T00:00:00Z', 9007199254740991, 0)",
    );
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2026-08-01",
        until: "2026-08-01",
        bucket: "day",
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          bucketStart: "2026-08-01",
          articleCount: 1,
          publishedArticleLikes: 9007199254740991,
        },
      ],
    });
    await d1.exec("DELETE FROM generation_articles");
    await d1.exec(
      "INSERT INTO generation_articles (generation_id, id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES ('legacy', 'unsafe', 'unsafe', 'u', 'n', '2026-08-02T00:00:00Z', 9007199254740993, 0)",
    );
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2026-08-02",
        until: "2026-08-02",
        bucket: "day",
      }),
    ).rejects.toThrow(
      "time series aggregate is not a safe nonnegative integer",
    );
    await d1.exec("DELETE FROM generation_articles");
    await d1.exec(
      "INSERT INTO generation_articles (generation_id, id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES ('legacy', 'negative', 'negative', 'u', 'n', '2026-08-03T00:00:00Z', -1, 0)",
    );
    await expect(
      getArticleTimeSeries(database(), "legacy", {
        since: "2026-08-03",
        until: "2026-08-03",
        bucket: "day",
      }),
    ).rejects.toThrow(
      "time series aggregate is not a safe nonnegative integer",
    );
  });

  test("refuses an oversized window before issuing SQL", async () => {
    let reads = 0;
    const db = drizzle(
      new Proxy({} as D1Database, {
        get(_target, property) {
          if (property === "then") return undefined;
          reads += 1;
          throw new Error(`D1 was read via ${String(property)}`);
        },
      }),
      { schema },
    );
    await expect(
      getArticleTimeSeries(db, "test-generation", {
        since: "2020-01-01",
        until: "2021-06-01",
        bucket: "day",
      }),
    ).rejects.toThrow("time series range is outside the supported bounds");
    expect(reads).toBe(0);
  });
});
