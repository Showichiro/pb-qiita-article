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

  beforeAll(async () => {
    await db.exec(
      "CREATE TABLE `articles` (`id` text PRIMARY KEY NOT NULL,`title` text NOT NULL,`user_id` text NOT NULL,`user_name` text NOT NULL,`created_at` text NOT NULL,`likes_count` integer NOT NULL,`stocks_count` integer NOT NULL);",
    );
    await db.exec(
      "CREATE TABLE `tags` (`article_id` text,`id` integer PRIMARY KEY NOT NULL,`name` text NOT NULL,FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE cascade ON DELETE cascade);",
    );
    const promises = [...Array(record)].map(async (_, index) => {
      return await db
        .prepare(
          "INSERT INTO `articles` (`id`, `title`, `user_id`, `user_name`, `created_at`, `likes_count`, `stocks_count`) VALUES (?, ?, ?, ?, ?, ?, ?);",
        )
        .bind(
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
            .prepare("INSERT INTO `tags` (`article_id`, `name`) VALUES (?, ?);")
            .bind(`${index}`, `tag-${index}`)
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
    const results = await findAllArticles(instance, {
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
    const results = await findAllArticles(instance, {
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
    const results = await findAllArticles(instance, {
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
    const results = await findAllArticles(instance, {
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
    const results = await findAllArticles(instance, {
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
    const results = await findAllArticles(instance, {
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
    const results = await findAllArticles(instance, {
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
        const results = await findAllArticles(instance, {
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
        const results = await findAllArticles(instance, {
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
        const results = await findAllArticles(instance, {
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
        const results = await findAllArticles(instance, {
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
            }),
        ]);
      });
      test("stocksCount", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "stocksCount",
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
            }),
        ]);
      });
      test("createdAt", async () => {
        const db = await mf.getD1Database("DB");
        const instance = drizzle(db, { schema, logger: true });
        const results = await findAllArticles(instance, {
          limit: null,
          offset: null,
          since: null,
          until: null,
          orderDirection,
          orderField: "createdAt",
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
            }),
        ]);
      });
    });
  });
});
