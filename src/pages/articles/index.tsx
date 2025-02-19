import {
  ArticleRangeAndOrder,
  Header,
  PageLayout,
  Pagenation,
  PageTitle,
  SelectBoxPageLimit,
  Spinner,
} from "@/components";
import { ArticlesContainer } from "@/containers";
import type { FindAllArticlesConfig, schema } from "@/db";
import type { DrizzleD1Database } from "@/lib";
import { type FC, Suspense } from "hono/jsx";

export const ArticlesPage: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
}> = ({ config, db }) => {
  const limit = config.limit ?? 10;
  const page = (config.offset ?? 0) / limit + 1;
  return (
    <>
      <Header />
      <PageTitle label="記事一覧" />
      <PageLayout>
        <ArticleRangeAndOrder default={{ ...config, page, limit }} />
        <Suspense fallback={<Spinner />}>
          <ArticlesContainer db={db} config={config} />
        </Suspense>
        <div class="my-4 flex">
          <div>
            <Pagenation {...config} page={page} limit={limit} />
          </div>
          <div class="ml-2">
            <SelectBoxPageLimit page={page} limit={limit} />
          </div>
        </div>
      </PageLayout>
    </>
  );
};
