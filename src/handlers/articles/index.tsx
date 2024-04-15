import { findAllArticles, schema } from "@/db";
import { drizzle } from "@/lib";
import { ArticlesPage } from "@/pages";
import { ArticlesQuery } from "@/schemas";
import { Bindings } from "@/types";
import { Handler } from "hono";

export const articleApiHandler: Handler<
  { Bindings: Bindings },
  "/api/articles",
  {
    in: {
      query: ArticlesQuery;
    };
    out: {
      query: ArticlesQuery;
    };
  }
> = async (c) => {
  const query = c.req.valid("query");
  const db = drizzle(c.env.DB, { schema, logger: true });
  const results = await findAllArticles(db, {
    ...query,
    since: query.since || null,
    until: query.until || null,
  });
  return c.json(results);
};

export const articlePageHandler: Handler<
  { Bindings: Bindings },
  "/articles",
  {
    in: {
      query: ArticlesQuery;
    };
    out: {
      query: ArticlesQuery;
    };
  }
> = (c) => {
  const query = c.req.valid("query");
  const db = drizzle(c.env.DB, { schema, logger: true });
  return c.render(
    <ArticlesPage
      db={db}
      config={{
        ...query,
        since: query.since ?? null,
        until: query.until ?? null,
      }}
    />,
    {
      title: "記事一覧",
    }
  );
};
