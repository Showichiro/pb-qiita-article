import { Ranking } from "@/components";
import {
  getArticleCountGroupByUser,
  getLikesCountGroupByUser,
  RankingConfig,
  schema,
} from "@/db";
import { DrizzleD1Database } from "@/lib";
import { FC } from "hono/jsx";

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
