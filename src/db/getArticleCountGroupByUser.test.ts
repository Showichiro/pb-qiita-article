import { drizzle } from "@/lib";
import { Miniflare } from "miniflare";
import { getArticleCountGroupByUser, schema } from "@/db";

describe("getArticleCountGroupByUser", async () => {
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
          `user-${index % 2 == 0 ? 0 : index}`,
          `user-${index % 2 == 0 ? 0 : index}`,
          new Date(index).toISOString(),
          0,
          0,
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

  test("schema", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await getArticleCountGroupByUser(instance, {
      since: null,
      until: null,
    });
    expect(results.length).toBe(6);
    expect(results).toEqual([
      { count: 5, userId: "user-0", userName: "user-0" },
      { count: 1, userId: "user-9", userName: "user-9" },
      { count: 1, userId: "user-7", userName: "user-7" },
      { count: 1, userId: "user-5", userName: "user-5" },
      { count: 1, userId: "user-3", userName: "user-3" },
      { count: 1, userId: "user-1", userName: "user-1" },
    ]);
  });

  test("since", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await getArticleCountGroupByUser(instance, {
      since: new Date(9).toISOString(),
      until: null,
    });
    expect(results.length).toBe(1);
    expect(results).toEqual([
      { count: 1, userId: "user-9", userName: "user-9" },
    ]);
  });

  test("until", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await getArticleCountGroupByUser(instance, {
      since: null,
      until: new Date(0).toISOString(),
    });
    expect(results.length).toBe(1);
    expect(results).toEqual([
      { count: 1, userId: "user-0", userName: "user-0" },
    ]);
  });

  test("since & until", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await getArticleCountGroupByUser(instance, {
      since: new Date(0).toISOString(),
      until: new Date(1).toISOString(),
    });
    expect(results.length).toBe(2);
    expect(results).toEqual([
      { count: 1, userId: "user-1", userName: "user-1" },
      { count: 1, userId: "user-0", userName: "user-0" },
    ]);
  });

  test("sort", async () => {
    const db = await mf.getD1Database("DB");
    const instance = drizzle(db, { schema, logger: true });
    const results = await getArticleCountGroupByUser(instance, {
      since: null,
      until: null,
      sort: "asc",
    });
    expect(results.length).toBe(6);
    expect(results).toEqual([
      { count: 1, userId: "user-1", userName: "user-1" },
      { count: 1, userId: "user-3", userName: "user-3" },
      { count: 1, userId: "user-5", userName: "user-5" },
      { count: 1, userId: "user-7", userName: "user-7" },
      { count: 1, userId: "user-9", userName: "user-9" },
      { count: 5, userId: "user-0", userName: "user-0" },
    ]);
  });
});
