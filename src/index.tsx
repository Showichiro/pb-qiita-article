import { zValidator } from "@/lib";
import {
  articleCountGroupByUserSchema,
  articleSchema,
  articlesQuery,
  countQuery,
  likesCountSchema,
} from "@/schemas";
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
  BadRequestHandler,
} from "@/handlers";
import { createHonoWithDBAndOpenAPI } from "./util/factory";

const app = createHonoWithDBAndOpenAPI();

// openapi settings
app.openAPIRegistry.register("Article", articleSchema);
app.openAPIRegistry.register("ArticleCount", articleCountGroupByUserSchema);
app.openAPIRegistry.register("LikesCount", likesCountSchema);

export default app
  // api
  .openapi(articlesRoute, articleApiHandler, BadRequestHandler)
  .openapi(postCountsRankingRoute, postCountsHandler, BadRequestHandler)
  .openapi(
    likesCountsRankingRoute,
    likesCountsRankingHandler,
    BadRequestHandler
  )
  // view
  .get("/", (c) => {
    return c.redirect("/articles");
  })
  .get(
    "/articles",
    zValidator("query", articlesQuery, BadRequestHandler),
    articlePageHandler
  )
  .get(
    "/ranking",
    zValidator("query", countQuery, BadRequestHandler),
    rankingPageHandler
  );
