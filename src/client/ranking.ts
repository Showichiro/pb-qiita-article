import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";

export type RankingQuery = {
  since: string;
  until: string;
  view: RankingView;
  topN: number;
};

export type RankingRequestQuery = Pick<RankingQuery, "since" | "until">;
export type RankingDisplay = Pick<RankingQuery, "view" | "topN">;
export type RankingView = "table" | "chart";

export type RankingDraft = RankingRequestQuery;

export type RankingConfig = {
  since: string | null;
  until: string | null;
};

export const defaultRankingQuery: RankingQuery = {
  since: "",
  until: "",
  view: "table",
  topN: 10,
};

export const toRankingDraft = (query: RankingRequestQuery): RankingDraft => ({
  since: query.since,
  until: query.until,
});

/**
 * Adapter to normalize server config (null for empty) to client query (empty string).
 * Preserves original timestamps/day-only GET semantics.
 */
export function adaptRankingConfig(config: RankingConfig): RankingQuery {
  return {
    since: config.since ?? "",
    until: config.until ?? "",
    view: defaultRankingQuery.view,
    topN: defaultRankingQuery.topN,
  };
}

export function configQueryParams(config: object): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(config)) {
    if (value == null || value === "") continue;
    for (const item of Array.isArray(value) ? value : [value])
      params.append(key, String(item));
  }
  return params;
}

const validDate = (value: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? value : "";

export function parseRankingQuery(params: URLSearchParams): RankingQuery {
  const since = validDate(params.get("since"));
  const until = validDate(params.get("until"));

  // Validate inverted dates on the client
  if (since && until && new Date(since) > new Date(until)) {
    throw new Error("開始日は終了日より前にしてください");
  }

  return {
    since,
    until,
    ...parseRankingDisplay(params),
  };
}

export function parseRankingDisplay(params: URLSearchParams): RankingDisplay {
  return {
    view: params.get("view") === "chart" ? "chart" : "table",
    topN: parseTopN(params.get("topN")),
  };
}

function parseTopN(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return defaultRankingQuery.topN;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return defaultRankingQuery.topN;
  return Math.max(1, Math.min(100, parsed));
}

export function rankingQueryParams(query: RankingQuery): URLSearchParams {
  const params = configQueryParams({
    since: query.since,
    until: query.until,
  });
  if (query.view !== defaultRankingQuery.view) params.set("view", query.view);
  if (query.topN !== defaultRankingQuery.topN)
    params.set("topN", String(query.topN));
  return params;
}

export function rankingRequestParams(
  query: RankingRequestQuery,
): URLSearchParams {
  return configQueryParams({ since: query.since, until: query.until });
}

export function rankingRequestKey(query: RankingRequestQuery): string {
  return rankingRequestParams(query).toString();
}

export function withRankingDisplay(
  query: RankingRequestQuery,
  display: RankingDisplay,
): RankingQuery {
  return { ...query, ...display };
}

export function likesCountForChart(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) ? numericValue : null;
}

export function isRankingQuery(value: unknown): value is RankingQuery {
  return (
    isRecord(value) &&
    typeof value.since === "string" &&
    typeof value.until === "string" &&
    (value.view === "table" || value.view === "chart") &&
    typeof value.topN === "number" &&
    Number.isInteger(value.topN) &&
    value.topN >= 1 &&
    value.topN <= 100
  );
}

export function isPostCountRows(
  value: unknown,
): value is ArticleCountGroupByUser[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.userId === "string" &&
        typeof item.userName === "string" &&
        typeof item.count === "number" &&
        Number.isSafeInteger(item.count) &&
        item.count >= 0,
    )
  );
}

export function isLikesCountRows(value: unknown): value is LikesCountSchema[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.userId === "string" &&
        typeof item.userName === "string" &&
        (item.totalLikesCount === null ||
          (typeof item.totalLikesCount === "string" &&
            /^\d+$/.test(item.totalLikesCount) &&
            Number.isFinite(Number(item.totalLikesCount)))),
    )
  );
}

export function validateRankingDraft(draft: RankingDraft): string | null {
  const sinceDate = draft.since ? new Date(draft.since) : null;
  const untilDate = draft.until ? new Date(draft.until) : null;

  if (sinceDate && Number.isNaN(sinceDate.getTime())) {
    return "開始日を確認してください";
  }
  if (untilDate && Number.isNaN(untilDate.getTime())) {
    return "終了日を確認してください";
  }
  if (sinceDate && untilDate && sinceDate > untilDate) {
    return "開始日は終了日より前にしてください";
  }
  return null;
}

export function commitRankingDraft(draft: RankingDraft): RankingRequestQuery {
  const error = validateRankingDraft(draft);
  if (error) throw new Error(error);
  return { since: draft.since, until: draft.until };
}

export function serializeRankingBootstrap(value: {
  config: RankingQuery;
  postCounts: ArticleCountGroupByUser[];
  likesCounts: LikesCountSchema[];
}): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export async function fetchRankingData(
  query: RankingRequestQuery,
  signal: AbortSignal,
): Promise<{
  postCounts: ArticleCountGroupByUser[];
  likesCounts: LikesCountSchema[];
}> {
  const response = await fetch(
    `/api/ranking/post-counts?${rankingRequestParams(query)}`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok)
    throw new Error(
      `記事数ランキングを取得できませんでした (${response.status})`,
    );
  const postCounts: unknown = await response.json();

  const likesResponse = await fetch(
    `/api/ranking/likes-counts?${rankingRequestParams(query)}`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!likesResponse.ok)
    throw new Error(
      `いいね数ランキングを取得できませんでした (${likesResponse.status})`,
    );
  const likesCounts: unknown = await likesResponse.json();

  if (!isPostCountRows(postCounts))
    throw new Error("記事数ランキングデータの形式が正しくありません");

  if (!isLikesCountRows(likesCounts))
    throw new Error("いいね数ランキングデータの形式が正しくありません");

  return { postCounts, likesCounts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
