import {
  Header,
  PageLayout,
  PageTitle,
  RankingRange,
  RankingScrollMenu,
  Spinner,
  ToTopButton,
} from "@/components";
import { RankningContainer } from "@/containers";
import type { RankingConfig, schema } from "@/db";
import type { DrizzleD1Database } from "@/lib";
import { dateTimetoDateString } from "@/util/dateFormatUtils";
import { type FC, Suspense } from "hono/jsx";

export const RankingPage: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: RankingConfig;
}> = ({ config, db }) => {
  return (
    <>
      <Header>
        <RankingScrollMenu />
      </Header>
      <PageTitle label="記事数・いいね数ランキング" />
      <PageLayout>
        <div class="my-4">
          <RankingRange
            default={{
              since: config.since ? dateTimetoDateString(config.since) : null,
              until: config.until ? dateTimetoDateString(config.until) : null,
            }}
          />
        </div>
        <Suspense fallback={<Spinner />}>
          <RankningContainer config={config} db={db} />
        </Suspense>
      </PageLayout>
      <ToTopButton />
    </>
  );
};
