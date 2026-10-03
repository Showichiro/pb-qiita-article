import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import {
  dataVersionResponseSchema,
  dataVersionsResponseSchema,
} from "@/schemas";

export const dataVersionRoute = createRoute({
  method: "get",
  path: "/api/data-version",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: dataVersionResponseSchema,
        },
      },
      description: "Current active data generation metadata",
    },
    503: {
      description: "No active or published generation available",
    },
  },
});

export const dataVersionsRoute = createRoute({
  method: "get",
  path: "/api/data-versions",
  request: {
    query: z.object({
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .default(3)
        .transform((value) => Math.min(value, 10))
        .describe("Number of versions to return"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: dataVersionsResponseSchema,
        },
      },
      description: "List of retained published generations",
    },
  },
});
