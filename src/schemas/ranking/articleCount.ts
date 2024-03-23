import { z } from "zod";

export const articleCountGroupByUserQuery = z.object({
  sinse: z.coerce.string().datetime().nullish(),
  until: z.coerce.string().datetime().nullish(),
});

export const articleCountGroupByUserSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  count: z.number(),
});

export type ArticleCountGroupByUser = z.infer<
  typeof articleCountGroupByUserSchema
>;
