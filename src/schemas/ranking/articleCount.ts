import { z } from "@hono/zod-openapi";

export const countQuery = z.object({
  since: z.coerce
    .date({
      error: "since must be a date",
    })
    .describe("ISO 8601 date")
    .nullish()
    .or(
      z.string().length(0, {
        message: "since must be a date",
      }),
    ),
  until: z.coerce
    .date({
      error: "until must be a date",
    })
    .describe("ISO 8601 date")
    .nullish()
    .or(
      z.string().length(0, {
        message: "until must be a date",
      }),
    ),
});

export type CountQuery = z.infer<typeof countQuery>;

export const articleCountGroupByUserSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  count: z.number(),
});

export type ArticleCountGroupByUser = z.infer<
  typeof articleCountGroupByUserSchema
>;
