import { z } from "@hono/zod-openapi";
import { tagSchema } from "../tags";

const searchText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => value || undefined);
const countBound = z.preprocess(
  (value) =>
    value == null || (typeof value === "string" && !value.trim())
      ? undefined
      : value,
  z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
);

export const articlesQuery = z
  .object({
    q: searchText,
    author: searchText,
    tags: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) =>
        [
          ...new Set(
            (typeof value === "string" ? [value] : (value ?? []))
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ].sort(),
      )
      .pipe(z.array(z.string().max(100)).max(20))
      .openapi({
        type: "array",
        items: { type: "string" },
        param: { style: "form", explode: true },
      }),
    minLikes: countBound,
    maxLikes: countBound,
    minStocks: countBound,
    maxStocks: countBound,
    limit: z.coerce
      .number({
        error: "Limit must be a number",
      })
      .max(100, {
        message: "Limit must be less than or equal to 100",
      })
      .default(10)
      .nullable(),
    offset: z.coerce
      .number({
        error: "Offset must be a number",
      })
      .default(0)
      .nullable(),
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
    orderField: z
      .enum(["likesCount", "createdAt", "stocksCount"], {
        error: "orderField must be likesCount, createdAt or stocksCount",
      })
      .nullish(),
    orderDirection: z
      .enum(["asc", "desc"], {
        error: "orderDirection must be asc or desc",
      })
      .nullish(),
  })
  .superRefine((query, ctx) => {
    for (const [min, max] of [
      ["minLikes", "maxLikes"],
      ["minStocks", "maxStocks"],
    ] as const) {
      if (query[min] != null && query[max] != null && query[min] > query[max]) {
        ctx.addIssue({
          code: "custom",
          path: [max],
          message: `${max} must be greater than or equal to ${min}`,
        });
      }
    }
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
