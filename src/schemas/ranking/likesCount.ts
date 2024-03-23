import { z } from "@/lib";

export const likesCountQuery = z.object({
  sinse: z.coerce.string().datetime().nullish(),
  until: z.coerce.string().datetime().nullish(),
});

export const likesCountSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  totalLikesCount: z.string().nullable(),
});

export type LikesCountSchema = z.infer<typeof likesCountSchema>;
