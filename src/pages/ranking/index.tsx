import { RankingRange } from "@/components";
import { RankningContainer } from "@/containers";
import { RankingConfig, schema } from "@/db";
import { DrizzleD1Database } from "@/lib";
import { dateTimetoDateString } from "@/util/dateFormatUtils";
import { FC, Suspense } from "hono/jsx";

export const RankingPage: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: RankingConfig;
}> = ({ config, db }) => {
  return (
    <>
      <h1>記事数・いいね数ランキング</h1>
      <RankingRange
        default={{
          since: config.since ? dateTimetoDateString(config.since) : null,
          until: config.until ? dateTimetoDateString(config.until) : null,
        }}
      />
      <Suspense fallback={"...loading"}>
        <RankningContainer config={config} db={db} />
      </Suspense>
    </>
  );
};
