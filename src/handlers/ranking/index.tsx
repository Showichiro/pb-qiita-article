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
    const results = await getArticleCountGroupByUser(db, generationId, {
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
    const results = await getLikesCountGroupByUser(db, generationId, {
      since: processDateParam(query.since),
      until: processDateParam(query.until),
    });
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
    const config = {
      ...query,
      since: processDateParam(query.since),
      until: processDateParam(query.until),
    };

    // Bootstrap both datasets for SSR
    const postCounts = await getArticleCountGroupByUser(
      db,
      generationId,
      config,
    );
    const likesCounts = await getLikesCountGroupByUser(
      db,
      generationId,
      config,
    );

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
      dataVersion: generationId,
      publishedSequence,
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
  });
};
