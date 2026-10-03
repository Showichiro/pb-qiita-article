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
  dataVersion: string;
}> = async ({ db, config, dataVersion }) => {
  const articleCountGroupByUsers = await getArticleCountGroupByUser(
    db,
    dataVersion,
    config,
  );
  const likesCount = await getLikesCountGroupByUser(db, dataVersion, config);

  return (
    <Ranking
      articleCountGroupByUsers={articleCountGroupByUsers}
      likesCounts={likesCount}
    />
  );
};
