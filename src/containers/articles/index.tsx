import { ArticlesTable } from "@/components";
import { findAllArticles, type FindAllArticlesConfig, type schema } from "@/db";
import type { DrizzleD1Database } from "@/lib";
import type { FC } from "hono/jsx";

export const ArticlesContainer: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
  dataVersion: string;
}> = async ({ config, db, dataVersion }) => {
  const articles = await findAllArticles(db, dataVersion, config);

  return <ArticlesTable articles={articles} />;
};
