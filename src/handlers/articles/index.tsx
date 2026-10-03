import { findAllArticles } from "@/db";
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
    const results = await findAllArticles(db, generationId, {
      ...query,
      since: processDateParam(query.since),
      until: processDateParam(query.until),
    });
    return c.json(results);
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

    return c.render(
      <ArticlesPage
        db={db}
        config={config}
        dataVersion={generationId}
        publishedSequence={publishedSequence}
      />,
    );
  });
};
