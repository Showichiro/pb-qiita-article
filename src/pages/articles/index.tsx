import { Header, PageLayout, PageTitle } from "@/components";
import { findAllArticles, type FindAllArticlesConfig, type schema } from "@/db";
import type { DrizzleD1Database } from "@/lib";
import {
  parseArticleQuery,
  serializeArticleBootstrap,
} from "@/client/articles";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { ArticlesSearch } from "./search";

export const ArticlesPage: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
}> = async ({ config, db }) => {
  const query = parseArticleQuery(
    new URLSearchParams(
      Object.entries(config)
        .filter(([, value]) => value != null)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const articles = await findAllArticles(db, {
    ...query,
    since: query.since || null,
    until: query.until || null,
  });
  return (
    <>
      <Header />
      <PageTitle label="記事一覧" />
      <PageLayout>
        <div id="articles-app">
          <ArticlesSearch query={query} articles={articles} />
        </div>
        <script id="articles-bootstrap" type="application/json">
          {raw(serializeArticleBootstrap({ config: query, articles }))}
        </script>
      </PageLayout>
    </>
  );
};
