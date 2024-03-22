import { renderer } from "@/renderer";
import { drizzle, zValidator, basicAuth, logger, Hono } from "@/lib";
import { schema } from "@/db";
import { findAllArticles } from "@/db";
import { Bindings } from "@/types";
import { articlesQuery } from "@/schemas";

const app = new Hono<{ Bindings: Bindings }>();

app
  .use(renderer)
  .use(logger())
  .use(
    "/api/*",
    basicAuth({ username: "pb-qiita-articles", password: "Ua:ciab7AeTh" })
  )
  .get("/api/articles", zValidator("query", articlesQuery), async (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB, { schema, logger: true });
    const results = await findAllArticles(db, {
      ...query,
      sinse: query.sinse ?? null,
      until: query.until ?? null,
    });
    return c.json(results);
  });

export default app;
