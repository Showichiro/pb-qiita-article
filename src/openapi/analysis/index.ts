import { timeSeriesQuery, timeSeriesResponseSchema } from "@/schemas";
import { createRoute } from "@hono/zod-openapi";

export const timeSeriesRoute = createRoute({
  method: "get",
  path: "/api/analysis/time-series",
  tags: ["analysis"],
  request: {
    query: timeSeriesQuery,
  },
  responses: {
    409: {
      description:
        "Requested immutable data generation is no longer retained; X-Data-Version identifies the current generation",
    },
    503: { description: "No published active data generation" },
    200: {
      description:
        "Buckets articles by the Japan calendar day, Monday-start week, or month of publication. publishedArticleLikes is the sum of the current likes_count snapshot for articles published in each bucket, not likes earned during that bucket.",
      content: {
        "application/json": {
          schema: timeSeriesResponseSchema,
        },
      },
    },
    400: {
      description: "bad request",
    },
  },
});
