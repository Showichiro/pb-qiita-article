import { renderer } from "@/renderer";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { basicAuth } from "hono/basic-auth";
import { logger } from "hono/logger";
import { findAllArticles } from "@/db/findAllArticles";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app
  .use(renderer)
  .use(logger())
  .use(
    "/api/*",
    basicAuth({ username: "pb-qiita-articles", password: "Ua:ciab7AeTh" })
  )
  .get(
    "/api/articles",
    zValidator(
      "query",
      z.object({
        limit: z.coerce.number().max(100).default(10).nullable(),
        offset: z.coerce.number().default(0).nullable(),
      })
    ),
    async (c) => {
      const { limit, offset } = c.req.valid("query");
      const db = drizzle(c.env.DB, { schema, logger: true });
      const results = await findAllArticles(db, { limit, offset });
      return c.json(results);
    }
  );

export default app;
