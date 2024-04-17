import { schema } from "@/db";
import { OpenAPIHono } from "@hono/zod-openapi";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";

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
  app.use(async (c, next) => {
    const db = drizzle(c.env.DB, { schema, logger: true });
    c.set("db", db);
    await next();
  });
  return app;
};
