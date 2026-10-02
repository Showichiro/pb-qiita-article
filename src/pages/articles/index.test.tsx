import { schema } from "@/db";
import { drizzle } from "@/lib";
import { renderer } from "@/util";
import { Miniflare } from "miniflare";
import { ArticlesPage } from "@/pages";

describe("ArticlesPage", async () => {
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

  it("should render article page", async () => {
    const { text } = await renderer(
      <ArticlesPage
        config={{ limit: null, offset: null, since: null, until: null }}
        db={instance}
      />,
    );
    expect(text).toContain('id="articles-app"');
    expect(text).toContain('action="/articles" method="get"');
    expect(text).toContain('class="react-island"');
    expect(text).toContain('data-slot="card"');
    expect(text).toContain('data-slot="input"');
    expect(text).toContain("10件");
    expect(text).not.toContain("btn btn-primary");
    expect(text).not.toContain("badge");
    expect(text).toContain(
      'href="/articles?orderField=createdAt&amp;orderDirection=desc&amp;limit=10&amp;offset=10"',
    );
    expect(text).not.toMatch(/<a[^>]*>前へ<\/a>/);
    expect(text).toMatch(/<button[^>]*disabled[^>]*>前へ<\/button>/);
    expect(text).toMatch(/<a [^>]*href="[^"]*offset=10"[^>]*>次へ<\/a>/);
    const bootstrap = text.match(
      /<script id="articles-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
    );
    expect(bootstrap).not.toBeNull();
    const initial = JSON.parse(bootstrap?.[1] ?? "null");
    expect(initial.config).toMatchObject({
      limit: 10,
      offset: 0,
      orderField: "createdAt",
      orderDirection: "desc",
    });
    expect(initial.articles).toHaveLength(record);
    expect(text).toMatchSnapshot();
  });
});
