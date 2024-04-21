import { schema } from "@/db";
import { renderer } from "@/renderer";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export type Env = {
  Variables: {
    db: DrizzleD1Database<typeof schema>;
  };
  Bindings: {
    DB: D1Database;
  };
};

export const createHonoWithDBAndOpenAPI = () => {
  const app = new OpenAPIHono<Env>();
  // cors
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173"],
    })
  );
  // openapi
  app
    .doc("/doc", {
      openapi: "3.0.0",
      info: {
        version: "1.0.0",
        title: "PB Qiita API",
      },
      servers: [
        {
          url: "http://localhost:5173/",
          description: "local",
        },
        {
          url: "https://pb-qiita-articles.pages.dev/",
          description: "PRD",
        },
      ],
    })
    .use(logger())
    .use(renderer)
    .get(
      "/ui",
      swaggerUI({
        url: "/doc",
      })
    );
  app.use(async (c, next) => {
    const db = drizzle(c.env.DB, { schema, logger: true });
    c.set("db", db);
    await next();
  });
  return app;
};
