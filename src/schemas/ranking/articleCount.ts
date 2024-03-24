import { z } from "zod";

export const countQuery = z.object({
  sinse: z.coerce.date().nullish().or(z.string().length(0)),
  until: z.coerce.date().nullish().or(z.string().length(0)),
});

export const articleCountGroupByUserSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  count: z.number(),
});

export type ArticleCountGroupByUser = z.infer<
  typeof articleCountGroupByUserSchema
>;
