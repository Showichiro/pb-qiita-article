import { Header, PageLayout, PageTitle } from "@/components";
import {
  findAllArticles,
  findArticleTags,
  type FindAllArticlesConfig,
  type schema,
} from "@/db";
import type { DrizzleD1Database } from "@/lib";
import {
  parseArticleQuery,
  configQueryParams,
  normalizeTags,
  serializeArticleBootstrap,
} from "@/client/articles";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { ArticlesSearch } from "./search";

export const ArticlesPage: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
  dataVersion: string;
  publishedSequence: number;
}> = async ({ config, db, dataVersion, publishedSequence }) => {
  const query = parseArticleQuery(configQueryParams(config));
  const articles = await findAllArticles(db, dataVersion, {
    ...query,
    since: query.since || null,
    until: query.until || null,
  });
  const tagOptions = normalizeTags([
    ...(await findArticleTags(db, dataVersion)),
    ...query.tags,
  ]);
  return (
    <>
      <Header />
      <PageTitle label="記事一覧" />
      <PageLayout>
        <div id="articles-app">
          <ArticlesSearch
            query={query}
            articles={articles}
            tagOptions={tagOptions}
          />
        </div>
        <script id="articles-bootstrap" type="application/json">
          {raw(
            serializeArticleBootstrap({
              config: query,
              articles,
              tagOptions,
              dataVersion,
              publishedSequence,
            }),
          )}
        </script>
      </PageLayout>
    </>
  );
};
