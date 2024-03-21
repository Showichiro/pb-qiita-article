import { Hono } from "hono";
import { renderer } from "./renderer";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { basicAuth } from "hono/basic-auth";
import { logger } from "hono/logger";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(renderer);

app
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
      const defaultLimit = 10;
      const defaultOffset = 0;
      const { limit, offset } = c.req.valid("query");
      const db = drizzle(c.env.DB, { schema, logger: true });
      const results = await db.query.articles.findMany({
        limit: limit ?? defaultLimit,
        offset: offset ?? defaultOffset,
        with: {
          tags: {
            columns: {
              articleId: false,
              id: false,
              name: true,
            },
          },
        },
      });
      return c.json(results);
    }
  );

export default app;
