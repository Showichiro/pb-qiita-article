import { z } from "@/lib";
import { tagSchema } from "../tags";

export const articlesQuery = z.object({
  limit: z.coerce.number().max(100).default(10).nullable(),
  offset: z.coerce.number().default(0).nullable(),
  since: z.coerce.string().datetime().nullish(),
  until: z.coerce.string().datetime().nullish(),
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
