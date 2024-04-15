import { drizzle } from "@/lib";
import { CountQuery } from "@/schemas";
import { Handler } from "hono";
import { Bindings } from "@/types";
import {
  getArticleCountGroupByUser,
  getLikesCountGroupByUser,
  schema,
} from "@/db";
import { dateToDatetimeString } from "@/util";
import { RankingPage } from "@/pages";

export const postCountsHandler: Handler<
  { Bindings: Bindings },
  "/api/ranking/post-counts",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = async (c) => {
  const query = c.req.valid("query");
  const db = drizzle(c.env.DB, { schema, logger: true });
  const results = await getArticleCountGroupByUser(db, {
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
  { Bindings: Bindings },
  "/api/ranking/likes-counts",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = async (c) => {
  const query = c.req.valid("query");
  const db = drizzle(c.env.DB, { schema, logger: true });
  const results = await getLikesCountGroupByUser(db, {
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
  { Bindings: Bindings },
  "/ranking",
  {
    in: { query: CountQuery };
    out: { query: CountQuery };
  }
> = (c) => {
  const query = c.req.valid("query");
  const db = drizzle(c.env.DB, { schema, logger: true });
  return c.render(
    <RankingPage
      db={db}
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
    }
  );
};
