import { drizzle } from "@/lib";
import { Miniflare } from "miniflare";
import { findAllArticles, schema } from "@/db";

describe("findAllArticles", async () => {
  const mf = new Miniflare({
    modules: true,
    d1Databases: ["DB"],
    script: `addEventListener("fetch", (event) => {
      event.respondWith(new Response("Hello Miniflare!"));
    })`,
  });

  const record = 10;
  const db = await mf.getD1Database("DB");
  const generationId = "test-generation";

  beforeAll(async () => {
    // Create versioned schema
    await db.exec(
      "CREATE TABLE `data_generations` (`id` text PRIMARY KEY NOT NULL, `state` text NOT NULL, `created_at` text NOT NULL, `published_sequence` integer, `article_count` integer, `tag_count` integer);",
    );
    await db.exec(
      "CREATE TABLE `generation_articles` (`generation_id` text NOT NULL, `id` text NOT NULL, `title` text NOT NULL, `user_id` text NOT NULL, `user_name` text NOT NULL, `created_at` text NOT NULL, `likes_count` integer NOT NULL, `stocks_count` integer NOT NULL, PRIMARY KEY(`generation_id`, `id`));",
    );
    await db.exec(
      "CREATE TABLE `generation_tags` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `generation_id` text NOT NULL, `article_id` text NOT NULL, `name` text NOT NULL, `position` integer NOT NULL);",
    );

    // Insert published generation
    await db
      .prepare(
        "INSERT INTO `data_generations` (`id`, `state`, `created_at`, `published_sequence`) VALUES (?, ?, ?, ?)",
      )
      .bind(generationId, "published", "2026-10-03T00:00:00Z", 1)
      .run();

    const promises = [...Array(record)].map(async (_, index) => {
      return await db
        .prepare(
          "INSERT INTO `generation_articles` (`generation_id`, `id`, `title`, `user_id`, `user_name`, `created_at`, `likes_count`, `stocks_count`) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
        )
        .bind(
          generationId,
          `${index}`,
          `title-${index}`,
          `user-${index}`,
          `user-${index}`,
          new Date(index).toISOString(),
          index,
          index + 1,
        )
        .run()
        .then(async () => {
          return await db
            .prepare("INSERT INTO `generation_tags` (`generation_id`, `article_id`, `name`, `position`) VALUES (?, ?, ?, ?);")
            .bind(generationId, `${index}`, `tag-${index}`, 0)
            .run();
        });
    });
    await Promise.all(promises);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  test("limit", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await findAllArticles(instance, generationId, {
      limit: 2,
      offset: 0,
      since: null,
      until: null,
    });
    expect(results.length).toBe(2);
    expect(results).toEqual([
      {
        createdAt: expect.any(String),
        id: "9",
        likesCount: 9,
        stocksCount: 10,
        tags: [
          {
            name: "tag-9",
          },
        ],
        title: "title-9",
        userId: "user-9",
        userName: "user-9",
      },
      {
        createdAt: expect.any(String),
        id: "8",
        likesCount: 8,
        stocksCount: 9,
        tags: [
          {
            name: "tag-8",
          },
        ],
        title: "title-8",
        userId: "user-8",
        userName: "user-8",
      },
    ]);
  });

  test("default limit", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await findAllArticles(instance, generationId, {
      limit: null,
      offset: 0,
      since: null,
      until: null,
    });
    expect(results.length).toBe(record);
    expect(results).toEqual([
      ...[...Array(record)]
        .map((_, index) => {
          return {
            createdAt: expect.any(String),
            id: `${index}`,
            likesCount: index,
            stocksCount: index + 1,
            tags: [
              {
                name: `tag-${index}`,
              },
            ],
            title: `title-${index}`,
            userId: `user-${index}`,
            userName: `user-${index}`,
          };
        })
        .reverse(),
    ]);
  });

  test("offset", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await findAllArticles(instance, generationId, {
      limit: 1,
      offset: 1,
      since: null,
      until: null,
    });
    expect(results.length).toBe(1);
    expect(results).toEqual([
      {
        createdAt: expect.any(String),
        id: "8",
        likesCount: 8,
        stocksCount: 9,
        tags: [
          {
            name: "tag-8",
          },
        ],
        title: "title-8",
        userId: "user-8",
        userName: "user-8",
      },
    ]);
  });

  test("default offset", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await findAllArticles(instance, generationId, {
      limit: 1,
      offset: null,
      since: null,
      until: null,
    });
    expect(results.length).toBe(1);
    expect(results).toEqual([
      {
        createdAt: expect.any(String),
        id: "9",
        likesCount: 9,
        stocksCount: 10,
        tags: [
          {
            name: "tag-9",
          },
        ],
        title: "title-9",
        userId: "user-9",
        userName: "user-9",
      },
    ]);
  });

  test("since", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await findAllArticles(instance, generationId, {
      limit: null,
      offset: null,
      since: new Date(9).toISOString(),
      until: null,
    });
    expect(results.length).toBe(1);
    expect(results).toEqual([
      {
        createdAt: expect.any(String),
        id: "9",
        likesCount: 9,
        stocksCount: 10,
        tags: [
          {
            name: "tag-9",
          },
        ],
        title: "title-9",
        userId: "user-9",
        userName: "user-9",
      },
    ]);
  });

  test("until", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await findAllArticles(instance, generationId, {
      limit: null,
      offset: null,
      since: null,
      until: new Date(0).toISOString(),
    });
    expect(results.length).toBe(1);
    expect(results).toEqual([
      {
        createdAt: expect.any(String),
        id: "0",
        likesCount: 0,
        stocksCount: 1,
        tags: [
          {
            name: "tag-0",
          },
        ],
        title: "title-0",
        userId: "user-0",
        userName: "user-0",
      },
    ]);
  });

  test("since and util", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await findAllArticles(instance, generationId, {
      limit: null,
      offset: null,
      since: new Date(0).toISOString(),
      until: new Date(1).toISOString(),
    });
    expect(results.length).toBe(2);
    expect(results).toEqual([
      {
        createdAt: expect.any(String),
        id: "1",
        likesCount: 1,
        stocksCount: 2,
        tags: [
          {
            name: "tag-1",
          },
        ],
        title: "title-1",
        userId: "user-1",
        userName: "user-1",
      },
      {
        createdAt: expect.any(String),
        id: "0",
        likesCount: 0,
        stocksCount: 1,
        tags: [
          {
            name: "tag-0",
          },
        ],
        title: "title-0",
        userId: "user-0",
        userName: "user-0",
      },
    ]);
  });

  describe("orderField", () => {
    describe("orderDirection = desc", () => {
      const orderDirection = "desc";
      test("likesCount", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, generationId, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "likesCount",
        });
        expect(results.length).toBe(record);
        expect(results).toEqual([
          ...[...Array(record)]
            .map((_, index) => {
              return {
                createdAt: expect.any(String),
                id: `${index}`,
                likesCount: index,
                stocksCount: index + 1,
                tags: [
                  {
                    name: `tag-${index}`,
                  },
                ],
                title: `title-${index}`,
                userId: `user-${index}`,
                userName: `user-${index}`,
              };
            })
            .reverse(),
        ]);
      });
      test("stocksCount", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, generationId, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "likesCount",
        });
        expect(results.length).toBe(record);
        expect(results).toEqual([
          ...[...Array(record)]
            .map((_, index) => {
              return {
                createdAt: expect.any(String),
                id: `${index}`,
                likesCount: index,
                stocksCount: index + 1,
                tags: [
                  {
                    name: `tag-${index}`,
                  },
                ],
                title: `title-${index}`,
                userId: `user-${index}`,
                userName: `user-${index}`,
              };
            })
            .reverse(),
        ]);
      });
      test("createdAt", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, generationId, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "likesCount",
        });
        expect(results.length).toBe(record);
        expect(results).toEqual([
          ...[...Array(record)]
            .map((_, index) => {
              return {
                createdAt: expect.any(String),
                id: `${index}`,
                likesCount: index,
                stocksCount: index + 1,
                tags: [
                  {
                    name: `tag-${index}`,
                  },
                ],
                title: `title-${index}`,
                userId: `user-${index}`,
                userName: `user-${index}`,
              };
            })
            .reverse(),
        ]);
      });
    });
    describe("orderDirection = asc", () => {
      const orderDirection = "asc";
      test("likesCount", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, generationId, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "likesCount",
        });
        expect(results.length).toBe(record);
        expect(results).toEqual([
          ...[...Array(record)].map((_, index) => {
            return {
              createdAt: expect.any(String),
              id: `${index}`,
              likesCount: index,
              stocksCount: index + 1,
              tags: [
                {
                  name: `tag-${index}`,
                },
              ],
              title: `title-${index}`,
              userId: `user-${index}`,
              userName: `user-${index}`,
            };
          }),
        ]);
      });
      test("stocksCount", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, generationId, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "stocksCount",
        });
        expect(results.length).toBe(record);
        expect(results).toEqual([
          ...[...Array(record)].map((_, index) => {
            return {
              createdAt: expect.any(String),
              id: `${index}`,
              likesCount: index,
              stocksCount: index + 1,
              tags: [
                {
                  name: `tag-${index}`,
                },
              ],
              title: `title-${index}`,
              userId: `user-${index}`,
              userName: `user-${index}`,
            };
          }),
        ]);
      });
      test("createdAt", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, generationId, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "createdAt",
        });
        expect(results.length).toBe(record);
        expect(results).toEqual([
          ...[...Array(record)].map((_, index) => {
            return {
              createdAt: expect.any(String),
              id: `${index}`,
              likesCount: index,
              stocksCount: index + 1,
              tags: [
                {
                  name: `tag-${index}`,
                },
              ],
              title: `title-${index}`,
              userId: `user-${index}`,
              userName: `user-${index}`,
            };
          }),
        ]);
      });
    });
  });
});

describe("literal substring filters beyond D1 LIKE pattern limits", () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"],
  });
  let DB: D1Database;
  beforeAll(async () => {
    DB = await runtime.getD1Database("DB");
    const { readFile } = await import("node:fs/promises");
    const migration = await readFile(
      "migrations/0000_quick_vanisher.sql",
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await DB.prepare(statement.trim()).run();
  });
  afterAll(() => runtime.dispose());

  test("SQLite instr is literal and lower folds ASCII without folding Unicode", async () => {
    const result = await DB.prepare(
      "SELECT instr(lower(?), lower(?)) AS asciiMatch, instr(lower(?), lower(?)) AS unicodeMiss, instr(?, ?) AS literalMatch, instr(?, ?) AS literalMiss, lower(?) AS folded",
    )
      .bind(
        "AbC",
        "bC",
        "Ä",
        "ä",
        "a%_\\b",
        "%_\\",
        "axb",
        "%_\\",
        "ABCÄ日本語",
      )
      .first();
    expect(result).toMatchObject({
      asciiMatch: 2,
      unicodeMiss: 0,
      literalMatch: 2,
      literalMiss: 0,
      folded: "abcÄ日本語",
    });
  });

  test.each([
    ["200 ASCII characters", "Ab".repeat(100), "Cd".repeat(100)],
    [
      "200 Japanese characters (600 UTF-8 bytes)",
      "日本語検索".repeat(40),
      "投稿者検索".repeat(40),
    ],
    [
      "200 wildcard characters",
      `${"%_\\".repeat(66)}%_`,
      `${"_%\\".repeat(66)}_%`,
    ],
    ["quoted SQL-looking text", "' OR 1=1 -- %_\\", "' OR 1=1 -- %_\\"],
  ])(
    "matches complete literal title AND author for %s before tag/range pagination",
    async (_label, q, author) => {
      const insert = async (
        id: string,
        title: string,
        userId: string,
        userName: string,
        likes = 0,
        tags = ["C#", "a,b"],
      ) => {
        await DB.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(id, title, userId, userName, "2026-01-01", likes, 2)
          .run();
        for (const tag of tags)
          await DB.prepare("INSERT INTO tags (article_id, name) VALUES (?, ?)")
            .bind(id, tag)
            .run();
      };
      await insert(
        "id-match",
        `prefix ${q} suffix`,
        `prefix ${author} suffix`,
        "other",
      );
      await insert(
        "name-match",
        `prefix ${q} suffix`,
        "other",
        `prefix ${author} suffix`,
      );
      await insert("truncated-title", `${q.slice(0, -1)}!`, author, "other");
      await insert("truncated-author", q, `${author.slice(0, -1)}!`, "other");
      await insert("wrong-range", q, author, "other", 1);
      await insert("missing-tag", q, author, "other", 0, ["C#"]);
      try {
        const config = {
          q: ` ${q.toLowerCase()} `,
          author: ` ${author.toLowerCase()} `,
          tags: ["C#", "a,b"],
          minLikes: 0,
          maxLikes: 0,
          minStocks: 2,
          maxStocks: 2,
          since: "2026-01-01",
          until: "2026-01-01",
          orderField: "createdAt" as const,
          orderDirection: "asc" as const,
          limit: 100,
          offset: 0,
        };
        const instance = drizzle(DB, { schema });
        const matches = await findAllArticles(instance, config);
        expect(matches.map((article) => article.id).sort()).toEqual([
          "id-match",
          "name-match",
        ]);
        expect(
          await findAllArticles(instance, generationId, { ...config, limit: 1, offset: 1 }),
        ).toEqual([matches[1]]);
        expect(
          await findAllArticles(instance, generationId, { ...config, offset: 2 }),
        ).toEqual([]);
      } finally {
        await DB.prepare("DELETE FROM tags").run();
        await DB.prepare("DELETE FROM articles").run();
      }
    },
  );
  test("matches ASCII case variants but distinguishes non-ASCII case for title and author", async () => {
    await DB.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(
        "case",
        "Mixed ASCII Ä日本語",
        "MixedWriter",
        "Ä投稿者",
        "2026-01-01",
        0,
        2,
      )
      .run();
    try {
      const instance = drizzle(DB, { schema });
      const base = { limit: 10, offset: 0, since: null, until: null };
      expect(
        await findAllArticles(instance, generationId, {
          ...base,
          q: "mixed ascii Ä日本語",
          author: "mixedwriter",
        }),
      ).toHaveLength(1);
      expect(
        await findAllArticles(instance, generationId, { ...base, q: "ä日本語" }),
      ).toEqual([]);
      expect(
        await findAllArticles(instance, generationId, { ...base, author: "ä投稿者" }),
      ).toEqual([]);
      expect(
        await findAllArticles(instance, generationId, { ...base, author: "Ä投稿者" }),
      ).toHaveLength(1);
    } finally {
      await DB.prepare("DELETE FROM articles").run();
    }
  });
});
