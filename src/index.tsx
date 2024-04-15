import { renderer } from "@/renderer";
import { zValidator, logger } from "@/lib";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings } from "@/types";
import { articlesQuery, countQuery } from "@/schemas";
import { swaggerUI } from "@hono/swagger-ui";
import {
  articlesRoute,
  likesCountsRankingRoute,
  postCountsRankingRoute,
} from "@/openapi";
import {
  articleApiHandler,
  articlePageHandler,
  likesCountsRankingHandler,
  postCountsHandler,
  rankingPageHandler,
} from "@/handlers";

const app = new OpenAPIHono<{ Bindings: Bindings }>();

app
  // openapi
  .doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "PB Qiita API",
    },
  })
  .openapi(articlesRoute, articleApiHandler)
  .openapi(postCountsRankingRoute, postCountsHandler)
  .openapi(likesCountsRankingRoute, likesCountsRankingHandler)
  .get(
    "/ui",
    swaggerUI({
      url: "/doc",
    })
  )
  // openapi end
  .use(renderer)
  .use(logger())
  .get("/", (c) => {
    return c.redirect("/articles");
  })
  .get("/articles", zValidator("query", articlesQuery), articlePageHandler)
  .get("/ranking", zValidator("query", countQuery), rankingPageHandler)
  // API
  .get("/api/articles", zValidator("query", articlesQuery), articleApiHandler)
  .get(
    "/api/ranking/post-counts",
    zValidator("query", countQuery),
    postCountsHandler
  )
  .get(
    "/api/ranking/likes-counts",
    zValidator("query", countQuery),
    likesCountsRankingHandler
  );

export default app;
