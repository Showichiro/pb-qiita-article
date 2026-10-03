import { articleSchema, articlesQuery } from "@/schemas";
import { createRoute, z } from "@hono/zod-openapi";

export const articlesRoute = createRoute({
  method: "get",
  path: "/api/articles",
  tags: ["article"],
  request: {
    query: articlesQuery,
  },
  responses: {
    409: {
      description:
        "Requested immutable data generation is no longer retained; X-Data-Version identifies the current generation",
    },
    503: { description: "No published active data generation" },
    200: {
      description: "get articles",
      content: {
        "application/json": {
          schema: z.array(articleSchema),
        },
      },
    },
    400: {
      description: "bad request",
    },
  },
});
