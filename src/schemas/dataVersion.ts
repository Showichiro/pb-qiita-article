import { z } from "@/lib";

export const dataVersionResponseSchema = z.object({
  dataVersion: z.string().uuid(),
  publishedSequence: z.number().int().positive(),
  publishedAt: z.string(),
  articleCount: z.number().int().nonnegative(),
  tagCount: z.number().int().nonnegative(),
});

export type DataVersionResponse = z.infer<typeof dataVersionResponseSchema>;

export const dataVersionsResponseSchema = z.object({
  versions: z.array(
    z.object({
      id: z.string().uuid(),
      publishedSequence: z.number().int().positive(),
      publishedAt: z.string(),
      articleCount: z.number().int().nonnegative(),
      tagCount: z.number().int().nonnegative(),
    }),
  ),
});

export type DataVersionsResponse = z.infer<typeof dataVersionsResponseSchema>;
