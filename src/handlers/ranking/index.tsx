import type { CountQuery } from "@/schemas";
import type { Handler } from "hono";
import { getArticleCountGroupByUser, getLikesCountGroupByUser } from "@/db";
import { dateToDatetimeString, processDateParam } from "@/util";
import { RankingPage } from "@/pages";
import type { Env } from "@/util";
import {
  serializeRankingBootstrap,
  adaptRankingConfig,
  parseRankingDisplay,
} from "@/client/ranking";

export const postCountsHandler: Handler<
  Env,
  "/api/ranking/post-counts",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = async (c) => {
  const query = c.req.valid("query");
  const results = await getArticleCountGroupByUser(c.var.db, {
    since:
      typeof query.since === "string"
        ? query.since
        : query.since == null
          ? null
          : dateToDatetimeString(query.since),
    until:
      typeof query.until === "string"
        ? query.until
        : query.until == null
          ? null
          : dateToDatetimeString(query.until),
  });
  return c.json(results);
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
  const results = await getLikesCountGroupByUser(c.var.db, {
    since: processDateParam(query.since),
    until: processDateParam(query.until),
  });
  return c.json(results);
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
  const config = {
    ...query,
    since: processDateParam(query.since),
    until: processDateParam(query.until),
  };

  // Bootstrap both datasets for SSR
  const postCounts = await getArticleCountGroupByUser(c.var.db, config);
  const likesCounts = await getLikesCountGroupByUser(c.var.db, config);

  // Normalize config for client bootstrap (null -> empty string)
  const requestUrl = new URL(c.req.url);
  const clientConfig = {
    ...adaptRankingConfig(config),
    since: requestUrl.searchParams.get("since") ?? "",
    until: requestUrl.searchParams.get("until") ?? "",
    ...parseRankingDisplay(requestUrl.searchParams),
  };

  const bootstrap = serializeRankingBootstrap({
    config: clientConfig,
    postCounts,
    likesCounts,
  });

  return c.render(
    <RankingPage
      bootstrap={bootstrap}
      config={clientConfig}
      postCounts={postCounts}
      likesCounts={likesCounts}
    />,
    {
      title: "ランキング",
    },
  );
};
