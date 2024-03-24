import { renderer } from "@/renderer";
import { drizzle, zValidator, logger, Hono } from "@/lib";
import { schema } from "@/db";
import {
  findAllArticles,
  getArticleCountGroupByUser,
  getLikesCountGroupByUser,
} from "@/db";
import { Bindings } from "@/types";
import { articlesQuery, countQuery } from "@/schemas";
import { ArticlesPage, RankingPage } from "./pages";
import { dateToDatetimeString } from "./util/dateFormatUtils";

const app = new Hono<{ Bindings: Bindings }>();

app
  .use(renderer)
  .use(logger())
  .get("/articles", zValidator("query", articlesQuery), (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB, { schema, logger: true });
    return c.html(
      <ArticlesPage
        db={db}
        config={{
          ...query,
          sinse: query.sinse ?? null,
          until: query.until ?? null,
        }}
      />
    );
  })
  .get("/ranking", zValidator("query", countQuery), (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB, { schema, logger: true });
    return c.html(
      <RankingPage
        db={db}
        config={{
          ...query,
          sinse:
            typeof query.sinse === "string"
              ? query.sinse
              : query.sinse == null
              ? null
              : dateToDatetimeString(query.sinse),
          until:
            typeof query.until === "string"
              ? query.until
              : query.until == null
              ? null
              : dateToDatetimeString(query.until),
        }}
      />
    );
  })
  // API
  .get("/api/articles", zValidator("query", articlesQuery), async (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB, { schema, logger: true });
    const results = await findAllArticles(db, {
      ...query,
      sinse: query.sinse || null,
      until: query.until || null,
    });
    return c.json(results);
  })
  .get(
    "/api/ranking/post-counts",
    zValidator("query", countQuery),
    async (c) => {
      const query = c.req.valid("query");
      const db = drizzle(c.env.DB, { schema, logger: true });
      const results = await getArticleCountGroupByUser(db, {
        sinse:
          typeof query.sinse === "string"
            ? query.sinse
            : query.sinse == null
            ? null
            : dateToDatetimeString(query.sinse),
        until:
          typeof query.until === "string"
            ? query.until
            : query.until == null
            ? null
            : dateToDatetimeString(query.until),
      });
      return c.json(results);
    }
  )
  .get(
    "/api/ranking/likes-counts",
    zValidator("query", countQuery),
    async (c) => {
      const query = c.req.valid("query");
      const db = drizzle(c.env.DB, { schema, logger: true });
      const results = await getLikesCountGroupByUser(db, {
        sinse:
          typeof query.sinse === "string"
            ? query.sinse
            : query.sinse == null
            ? null
            : dateToDatetimeString(query.sinse),
        until:
          typeof query.until === "string"
            ? query.until
            : query.until == null
            ? null
            : dateToDatetimeString(query.until),
      });
      return c.json(results);
    }
  );

export default app;
