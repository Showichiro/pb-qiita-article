import {
  articleCountGroupByUserSchema,
  countQuery,
  likesCountSchema,
} from "@/schemas";
import { createRoute, z } from "@hono/zod-openapi";

export const postCountsRankingRoute = createRoute({
  method: "get",
  path: "/api/ranking/post-counts",
  tags: ["article"],
  request: {
    query: countQuery,
  },
  responses: {
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
  tags: ["article"],
  request: {
    query: countQuery,
  },
  responses: {
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
