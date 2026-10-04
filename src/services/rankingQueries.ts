import { getArticleCountGroupByUser, getLikesCountGroupByUser } from "@/db";
import type { CountQuery } from "@/schemas";
import { processDateParam } from "@/util/dateParamsUtils";
import {
  adaptRankingConfig,
  parseRankingDisplay,
  serializeRankingBootstrap,
} from "@/client/ranking";

export function rankingConfig(query: CountQuery) {
  return {
    since: processDateParam(query.since),
    until: processDateParam(query.until),
  };
}

export async function loadRankingPageData(
  db: Parameters<typeof getArticleCountGroupByUser>[0],
  query: CountQuery,
  params: URLSearchParams,
  dataVersion: string,
  publishedSequence: number,
  source = { getArticleCountGroupByUser, getLikesCountGroupByUser },
) {
  const requestConfig = rankingConfig(query);
  const [postCounts, likesCounts] = await Promise.all([
    source.getArticleCountGroupByUser(db, dataVersion, requestConfig),
    source.getLikesCountGroupByUser(db, dataVersion, requestConfig),
  ]);
  const config = {
    ...adaptRankingConfig(requestConfig),
    since: params.get("since") ?? "",
    until: params.get("until") ?? "",
    ...parseRankingDisplay(params),
  };
  return {
    config,
    postCounts,
    likesCounts,
    bootstrap: serializeRankingBootstrap({
      config,
      postCounts,
      likesCounts,
      dataVersion,
      publishedSequence,
    }),
  };
}
