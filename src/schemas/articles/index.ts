import { z } from "@hono/zod-openapi";
import { tagSchema } from "../tags";

export const articlesQuery = z.object({
  limit: z.coerce
    .number({
      invalid_type_error: "Limit must be a number",
    })
    .max(100, {
      message: "Limit must be less than or equal to 100",
    })
    .default(10)
    .nullable(),
  offset: z.coerce
    .number({
      invalid_type_error: "Offset must be a number",
    })
    .default(0)
    .nullable(),
  since: z.coerce
    .date({
      description: "ISO 8601 date",
      invalid_type_error: "since must be a date",
    })
    .nullish()
    .or(
      z.string().length(0, {
        message: "since must be a date",
      }),
    ),
  until: z.coerce
    .date({
      description: "ISO 8601 date",
      invalid_type_error: "until must be a date",
    })
    .nullish()
    .or(
      z.string().length(0, {
        message: "until must be a date",
      }),
    ),
  orderField: z
    .enum(["likesCount", "createdAt", "stocksCount"], {
      invalid_type_error:
        "orderField must be likesCount, createdAt or stocksCount",
    })
    .nullish(),
  orderDirection: z
    .enum(["asc", "desc"], {
      invalid_type_error: "orderDirection must be asc or desc",
    })
    .nullish(),
});

export type ArticlesQuery = z.infer<typeof articlesQuery>;

export const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  userId: z.string(),
  userName: z.string(),
  createdAt: z.string(),
  likesCount: z.number(),
  stocksCount: z.number(),
  tags: z.array(tagSchema),
});

export type Article = z.infer<typeof articleSchema>;
