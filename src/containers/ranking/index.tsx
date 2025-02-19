import { Ranking } from "@/components";
import {
  getArticleCountGroupByUser,
  getLikesCountGroupByUser,
  type RankingConfig,
  type schema,
} from "@/db";
import type { DrizzleD1Database } from "@/lib";
import type { FC } from "hono/jsx";

export const RankningContainer: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: RankingConfig;
}> = async ({ db, config }) => {
  const articleCountGroupByUsers = await getArticleCountGroupByUser(db, config);
  const likesCount = await getLikesCountGroupByUser(db, config);

  return (
    <Ranking
      articleCountGroupByUsers={articleCountGroupByUsers}
      likesCounts={likesCount}
    />
  );
};
