import { Header, PageLayout, PageTitle } from "@/components";
import type { ArticlesPageData } from "@/services/articleQueries";
import { serializeArticleBootstrap } from "@/client/articles";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { ArticlesSearch } from "./search";

export const ArticlesPage: FC<ArticlesPageData> = ({
  config: query,
  articles,
  tagOptions,
  dataVersion,
  publishedSequence,
}) => {
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
