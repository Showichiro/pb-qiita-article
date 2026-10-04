import {
  migrateTestGeneration,
  refreshTestGeneration,
} from "@/db/test-generation";
import { schema } from "@/db";
import { drizzle } from "@/lib";
import { renderer } from "@/util";
import { Miniflare } from "miniflare";
import { ArticlesPage } from "@/pages";
import { loadArticlesPageData } from "@/services/articleQueries";
import type { FindAllArticlesConfig } from "@/db";
import type { FC } from "hono/jsx";

const LoadedArticlesPage: FC<{
  db: Parameters<typeof loadArticlesPageData>[0];
  config: FindAllArticlesConfig;
  dataVersion: string;
  publishedSequence: number;
}> = async ({ db, config, dataVersion, publishedSequence }) => (
  <ArticlesPage
    {...(await loadArticlesPageData(
      db,
      config,
      dataVersion,
      publishedSequence,
    ))}
  />
);

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
    await migrateTestGeneration(db);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  const instance = drizzle(db, { schema, logger: true });

  it("renders selected unavailable and punctuation tags, all bounds and filter-preserving native links", async () => {
    await db
      .prepare("INSERT INTO tags (article_id, name) VALUES (?, ?)")
      .bind("0", "C#")
      .run();
    await db
      .prepare("INSERT INTO tags (article_id, name) VALUES (?, ?)")
      .bind("0", "a,b")
      .run();
    await refreshTestGeneration(db);
    const { text } = await renderer(
      <LoadedArticlesPage
        dataVersion="legacy"
        publishedSequence={1}
        config={{
          since: null,
          until: null,
          q: " title ",
          author: "user",
          tags: ["a,b", "C#"],
          minLikes: 0,
          maxLikes: 0,
          minStocks: 0,
          maxStocks: 0,
          limit: 1,
          offset: 0,
        }}
        db={instance}
      />,
    );
    for (const name of [
      "q",
      "author",
      "tags",
      "minLikes",
      "maxLikes",
      "minStocks",
      "maxStocks",
    ])
      expect(text).toContain(`name="${name}"`);
    expect(text).toContain('value="C#" selected');
    expect(text).toContain('value="a,b" selected');
    expect(text).toContain("multiple");
    expect(text).toContain("tags=C%23&amp;tags=a%2Cb");
    const encoded = text.match(
      /<script id="articles-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
    );
    const initial = JSON.parse(encoded?.[1] ?? "null");
    expect(initial.config).toMatchObject({
      q: "title",
      author: "user",
      tags: ["C#", "a,b"],
      minLikes: 0,
      maxStocks: 0,
    });
    expect(initial.articles).toHaveLength(1);
    expect(initial.tagOptions).toContain("C#");
    const missing = await renderer(
      <LoadedArticlesPage
        dataVersion="legacy"
        publishedSequence={1}
        config={{
          limit: null,
          offset: null,
          since: null,
          until: null,
          tags: ["unavailable"],
        }}
        db={instance}
      />,
    );
    expect(missing.text).toContain('value="unavailable" selected');
    await db
      .prepare("DELETE FROM tags WHERE name IN (?, ?)")
      .bind("C#", "a,b")
      .run();
  });
  it("retains an unknown 100-character selected tag alongside punctuation tags in the native GET form", async () => {
    const longTag = "x".repeat(100);
    const { text } = await renderer(
      <LoadedArticlesPage
        dataVersion="legacy"
        publishedSequence={1}
        config={{
          limit: null,
          offset: null,
          since: null,
          until: null,
          tags: [longTag, "C#"],
        }}
        db={instance}
      />,
    );
    expect(text).toContain('action="/articles" method="get"');
    expect(text).toContain(`value="${longTag}" selected=""`);
    expect(text).toContain('value="C#" selected=""');
    const select = text.match(
      /<select[^>]*name="tags"[^>]*>([\s\S]*?)<\/select>/,
    );
    expect(select?.[0]).toContain('multiple=""');
    expect(select?.[1]).toContain(longTag);
    const bootstrap = text.match(
      /<script id="articles-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
    );
    const initial = JSON.parse(bootstrap?.[1] ?? "null");
    expect(initial.config.tags).toEqual(["C#", longTag]);
    expect(initial.tagOptions).toEqual(expect.arrayContaining(["C#", longTag]));
  });
  it("rejects invalid ranges in the shared page parser", async () => {
    await expect(
      renderer(
        <LoadedArticlesPage
          dataVersion="legacy"
          publishedSequence={1}
          config={{
            limit: null,
            offset: null,
            since: null,
            until: null,
            minLikes: 10,
            maxLikes: 1,
          }}
          db={instance}
        />,
      ),
    ).resolves.toMatchObject({ status: 500 });
  });
  it("should render article page", async () => {
    await db.prepare("DELETE FROM tags WHERE name IN ('C#','a,b')").run();
    await refreshTestGeneration(db);
    const { text } = await renderer(
      <LoadedArticlesPage
        dataVersion="legacy"
        publishedSequence={1}
        config={{ limit: null, offset: null, since: null, until: null }}
        db={instance}
      />,
    );
    expect(text).toContain('id="articles-app"');
    expect(text).toContain('action="/articles" method="get"');
    expect(text).toContain('class="react-island articles-mobile"');
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());
