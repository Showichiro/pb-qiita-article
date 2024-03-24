import { Pagenation } from "@/components";
import { ArticlesContainer } from "@/containers";
import { FindAllArticlesConfig, schema } from "@/db";
import { DrizzleD1Database } from "@/lib";
import { FC, Suspense } from "hono/jsx";

export const ArticlesPage: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
}> = ({ config, db }) => {
  const limit = config.limit ?? 10;
  const page = (config.offset ?? 0) / limit + 1;
  return (
    <>
      <h1>記事一覧</h1>
      <Suspense fallback={"...loading"}>
        <ArticlesContainer db={db} config={config} />
      </Suspense>
      <Pagenation page={page} limit={limit} />
    </>
  );
};
