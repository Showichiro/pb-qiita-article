import { renderer } from "@/util";
import { Miniflare } from "miniflare";
import { ArticlesContainer } from ".";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "@/db";

describe("ArticlesContainer", async () => {
  const mf = new Miniflare({
    modules: true,
    d1Databases: ["DB"],
    script: `addEventListener("fetch", (event) => {
          event.respondWith(new Response("Hello Miniflare!"));
        })`,
  });

  const db = await mf.getD1Database("DB");

  const record = 10;
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
          `user-${index % 2 === 0 ? 0 : index}`,
          `user-${index % 2 === 0 ? 0 : index}`,
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

  const instance = drizzle(db, { schema, logger: true });

  it("should render article table", async () => {
    const { text } = await renderer(
      <ArticlesContainer
        db={instance}
        config={{ limit: null, offset: null, since: null, until: null }}
      />,
    );
    expect(text).toMatchSnapshot();
  });
});
