import {
  articleCountGroupByUserSchema,
  countQuery,
  likesCountSchema,
} from "@/schemas";
import { createRoute, z } from "@hono/zod-openapi";

export const postCountsRankingRoute = createRoute({
  method: "get",
  path: "/api/ranking/post-counts",
  tags: ["ranking"],
  request: {
    query: countQuery,
  },
  responses: {
    409: {
      description:
        "Requested immutable data generation is no longer retained; X-Data-Version identifies the current generation",
    },
    503: { description: "No published active data generation" },
    200: {
      description: "get post counts ranking",
      content: {
        "application/json": {
          schema: z.array(articleCountGroupByUserSchema),
        },
      },
    },
    400: {
      description: "bad request",
    },
  },
});

export const likesCountsRankingRoute = createRoute({
  method: "get",
  path: "/api/ranking/likes-counts",
  tags: ["ranking"],
  request: {
    query: countQuery,
  },
  responses: {
    409: {
      description:
        "Requested immutable data generation is no longer retained; X-Data-Version identifies the current generation",
    },
    503: { description: "No published active data generation" },
    200: {
      description: "get likes counts ranking",
      content: {
        "application/json": {
          schema: z.array(likesCountSchema),
        },
      },
    },
    400: {
      description: "bad request",
    },
  },
});
