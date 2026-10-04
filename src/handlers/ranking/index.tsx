import type { CountQuery } from "@/schemas";
import type { Handler } from "hono";
import { getArticleCountGroupByUser, getLikesCountGroupByUser } from "@/db";
import { loadRankingPageData, rankingConfig } from "@/services/rankingQueries";
import { RankingPage } from "@/pages";
import type { Env } from "@/util";
import { withDataVersion } from "@/util/dataVersion";

export const postCountsHandler: Handler<
  Env,
  "/api/ranking/post-counts",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = async (c) => {
  const query = c.req.valid("query");

  return withDataVersion(c, async (db, generationId, _publishedSequence) => {
    const results = await getArticleCountGroupByUser(
      db,
      generationId,
      rankingConfig(query),
    );
    return c.json(results);
  });
};

export const likesCountsRankingHandler: Handler<
  Env,
  "/api/ranking/likes-counts",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = async (c) => {
  const query = c.req.valid("query");

  return withDataVersion(c, async (db, generationId, _publishedSequence) => {
    const results = await getLikesCountGroupByUser(
      db,
      generationId,
      rankingConfig(query),
    );
    return c.json(results);
  });
};

export const rankingPageHandler: Handler<
  Env,
  "/ranking",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = async (c) => {
  const query = c.req.valid("query");

  return withDataVersion(c, async (db, generationId, publishedSequence) => {
    const data = await loadRankingPageData(
      db,
      query,
      new URL(c.req.url).searchParams,
      generationId,
      publishedSequence,
    );
    return c.render(<RankingPage {...data} />, {
      title: "ランキング",
    });
  });
};
