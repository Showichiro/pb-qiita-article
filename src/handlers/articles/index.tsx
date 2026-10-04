import { loadArticles, loadArticlesPageData } from "@/services/articleQueries";
import { ArticlesPage } from "@/pages";
import type { ArticlesQuery } from "@/schemas";
import type { Env } from "@/util";
import { processDateParam } from "@/util";
import { withDataVersion } from "@/util/dataVersion";
import type { Handler } from "hono";

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

  return withDataVersion(c, async (db, generationId, _publishedSequence) => {
    const { articles } = await loadArticles(
      db,
      {
        ...query,
        since: processDateParam(query.since),
        until: processDateParam(query.until),
      },
      generationId,
    );
    return c.json(articles);
  });
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
> = async (c) => {
  const query = c.req.valid("query");

  return withDataVersion(c, async (db, generationId, publishedSequence) => {
    const config = {
      ...query,
      since: processDateParam(query.since),
      until: processDateParam(query.until),
    };

    const data = await loadArticlesPageData(
      db,
      config,
      generationId,
      publishedSequence,
    );
    return c.render(<ArticlesPage {...data} />);
  });
};
