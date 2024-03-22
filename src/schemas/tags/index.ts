import { z } from "@/lib";

export const tagSchema = z.object({
  name: z.string(),
});

export type Tag = z.infer<typeof tagSchema>;
