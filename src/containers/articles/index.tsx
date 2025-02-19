import { ArticlesTable } from "@/components";
import { findAllArticles, type FindAllArticlesConfig, type schema } from "@/db";
import type { DrizzleD1Database } from "@/lib";
import type { FC } from "hono/jsx";

export const ArticlesContainer: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
}> = async ({ config, db }) => {
  const articles = await findAllArticles(db, config);

  return <ArticlesTable articles={articles} />;
};
