import { z } from "@/lib";

export const likesCountSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  totalLikesCount: z.string().nullable(),
});

export type LikesCountSchema = z.infer<typeof likesCountSchema>;
