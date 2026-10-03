import { zValidator } from "@/lib";
import {
  articleCountGroupByUserSchema,
  articleSchema,
  articlesQuery,
  countQuery,
  likesCountSchema,
  timeSeriesQuery,
  timeSeriesResponseSchema,
} from "@/schemas";
import {
  articlesRoute,
  dataVersionRoute,
  dataVersionsRoute,
  likesCountsRankingRoute,
  postCountsRankingRoute,
  timeSeriesRoute,
} from "@/openapi";
import {
  articleApiHandler,
  articlePageHandler,
  analysisPageHandler,
  dataVersionHandler,
  dataVersionsHandler,
  likesCountsRankingHandler,
  postCountsHandler,
  rankingPageHandler,
  timeSeriesHandler,
  BadRequestHandler,
} from "@/handlers";
import { createHonoWithDBAndOpenAPI } from "./util/factory";

const app = createHonoWithDBAndOpenAPI();

// openapi settings
app.openAPIRegistry.register("Article", articleSchema);
app.openAPIRegistry.register("ArticleCount", articleCountGroupByUserSchema);
app.openAPIRegistry.register("LikesCount", likesCountSchema);
app.openAPIRegistry.register("TimeSeries", timeSeriesResponseSchema);

const routes = app
  // api
  .openapi(articlesRoute, articleApiHandler, BadRequestHandler)
  .openapi(postCountsRankingRoute, postCountsHandler, BadRequestHandler)
  .openapi(
    likesCountsRankingRoute,
    likesCountsRankingHandler,
    BadRequestHandler,
  )
  .openapi(timeSeriesRoute, timeSeriesHandler, BadRequestHandler)
  .openapi(dataVersionRoute, dataVersionHandler)
  .openapi(dataVersionsRoute, dataVersionsHandler)
  // view
  .get("/", (c) => {
    return c.redirect("/articles");
  })
  .get(
    "/articles",
    zValidator("query", articlesQuery, BadRequestHandler),
    articlePageHandler,
  )
  .get(
    "/ranking",
    zValidator("query", countQuery, BadRequestHandler),
    rankingPageHandler,
  )
  .get(
    "/analysis",
    zValidator("query", timeSeriesQuery, BadRequestHandler),
    analysisPageHandler,
  );

export default routes;
export type AppType = typeof routes;
