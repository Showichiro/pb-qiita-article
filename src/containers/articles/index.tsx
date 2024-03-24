import { ArticlesTable } from "@/components";
import { findAllArticles, FindAllArticlesConfig, schema } from "@/db";
import { DrizzleD1Database } from "@/lib";
import { FC } from "hono/jsx";

export const ArticlesContainer: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
}> = async ({ config, db }) => {
  const articles = await findAllArticles(db, config);

  return <ArticlesTable articles={articles} />;
};
