import { findAllArticles } from "@/db";
import { ArticlesPage } from "@/pages";
import { ArticlesQuery } from "@/schemas";
import { dateToDatetimeString, Env } from "@/util";
import { processDateParam } from "@/util";
import { Handler } from "hono";

export const articleApiHandler: Handler<
  Env,
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
  const results = await findAllArticles(c.var.db, {
    ...query,
    since: processDateParam(query.since),
    until: processDateParam(query.until),
  });
  return c.json(results);
};

export const articlePageHandler: Handler<
  Env,
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
  return c.render(
    <ArticlesPage
      db={c.var.db}
      config={{
        ...query,
        since: processDateParam(query.since),
        until: processDateParam(query.until),
      }}
    />,
    {
      title: "記事一覧",
    },
  );
};
