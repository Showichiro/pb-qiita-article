import { rm } from "node:fs/promises";
import { schema } from "@/db";
import { z } from "@/lib";

const qiitaItem = z.object({
  id: z.string(),
  title: z.string(),
  likes_count: z.number(),
  stocks_count: z.number(),
  created_at: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
  }),
  tags: z.array(z.object({ name: z.string() })),
});

const qiitaItems = z.array(qiitaItem);

const apiKey = process.env.QIITA_API_KEY;

const articleSQLTemplate = (
  param: typeof schema.articles.$inferInsert
): string =>
  `INSERT OR REPLACE INTO articles(id,title,user_id,user_name,created_at,likes_count,stocks_count) VALUES('${param.id}','${param.title}','${param.userId}','${param.userName}','${param.createdAt}',${param.likesCount},${param.stocksCount}); `;

const tagDeleteSQLTemplate = (param: { artcleIds: string[] }): string =>
  `DELETE FROM tags WHERE article_id in (${param.artcleIds
    .map((id) => `'${id}'`)
    .join(",")}); `;

const tagInsertSQLTemplate = (param: typeof schema.tags.$inferInsert): string =>
  `INSERT OR REPLACE INTO tags(article_id,name) VALUES('${param.articleId}','${param.name}'); `;

if (apiKey) {
  if (
    Array.from(new Bun.Glob("data").scanSync({ onlyFiles: false })).length > 0
  ) {
    // delete data directory
    await rm("data", { recursive: true, force: true });
  }
  // fetch articles
  const url = new URL("https://qiita.com/api/v2/items");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("query", "org:primebrains");
  let page = 1;
  let loop = true;

  while (loop) {
    url.searchParams.set("page", page.toString());
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const json = await response.json();
      const items = qiitaItems.parse(json);
      let articleSQL = "";
      let tagsSQL =
        tagDeleteSQLTemplate({
          artcleIds: Array.from(new Set(items.map((id) => id.id))),
        }) + "\n";
      for (const item of items) {
        articleSQL +=
          articleSQLTemplate({
            id: item.id,
            title: item.title,
            createdAt: item.created_at,
            likesCount: item.likes_count,
            stocksCount: item.stocks_count,
            userId: item.user.id,
            userName: item.user.name,
          }) + "\n";
        item.tags.forEach((tag) => {
          tagsSQL +=
            tagInsertSQLTemplate({
              articleId: item.id,
              name: tag.name,
            }) + "\n";
        });
      }
      await Bun.write(`data/articles/insert-${page}.sql`, articleSQL, {
        createPath: true,
      });
      await Bun.write(`data/tags/insert-${page}.sql`, tagsSQL, {
        createPath: true,
      });
      page++;
      loop = items.length === 100;
    } else {
      break;
    }
  }
}
