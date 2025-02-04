import { CountQuery } from "@/schemas";
import { Handler } from "hono";
import { getArticleCountGroupByUser, getLikesCountGroupByUser } from "@/db";
import { dateToDatetimeString } from "@/util";
import { RankingPage } from "@/pages";
import { Env } from "@/util";

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

export const rankingPageHandler: Handler<
  Env,
  "/ranking",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = (c) => {
  const query = c.req.valid("query");
  return c.render(
    <RankingPage
      db={c.var.db}
      config={{
        ...query,
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
      }}
    />,
    {
      title: "ランキング",
    },
  );
};
