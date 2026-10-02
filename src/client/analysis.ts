export type AnalysisBucket = "day" | "week" | "month";
export type AnalysisMetric = "posts" | "likes";
export type AnalysisView = "table" | "chart";

export type AnalysisQuery = {
  since: string;
  until: string;
  bucket: AnalysisBucket;
  author: string;
  tags: string[];
};

export type AnalysisState = AnalysisQuery & {
  metric: AnalysisMetric;
  view: AnalysisView;
};

export type AnalysisDraft = {
  since: string;
  until: string;
  bucket: string;
  author: string;
  tags: string[];
};

export type AnalysisRow = {
  bucketStart: string;
  articleCount: number;
  publishedArticleLikes: number;
};

export type AnalysisResponse = Pick<
  AnalysisQuery,
  "since" | "until" | "bucket"
> & {
  rows: AnalysisRow[];
};

export type AnalysisBootstrap = {
  state: AnalysisState;
  rows: AnalysisRow[];
  tagOptions: string[];
};

export const analysisBuckets: readonly AnalysisBucket[] = [
  "day",
  "week",
  "month",
];

export function defaultAnalysisQuery(now = new Date()): AnalysisQuery {
  const until = now.toISOString().slice(0, 10);
  return {
    since: shiftUtcDay(until, -89),
    until,
    bucket: "day",
    author: "",
    tags: [],
  };
}

export function isUtcDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function normalizeAnalysisTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort();
}

export function analysisDraftError(draft: AnalysisDraft): string | null {
  if (
    draft.bucket !== "day" &&
    draft.bucket !== "week" &&
    draft.bucket !== "month"
  )
    return "集計単位を確認してください。";
  if (!isUtcDate(draft.since) || !isUtcDate(draft.until))
    return "開始日と終了日には実在する日付を指定してください。";
  if (draft.since > draft.until) return "開始日は終了日以前にしてください。";
  const author = draft.author.trim();
  if (author.length > 200) return "投稿者は200文字以内で入力してください。";
  const tags = normalizeAnalysisTags(draft.tags);
  if (tags.length > 20 || tags.some((tag) => tag.length > 100))
    return "タグは各100文字以内、20個まで選択してください。";
  const days =
    (Date.parse(`${draft.until}T00:00:00Z`) -
      Date.parse(`${draft.since}T00:00:00Z`)) /
      86_400_000 +
    1;
  if (days > 3660) return "期間は3660日以内で指定してください。";
  if (bucketCount(draft.since, draft.until, draft.bucket) > 400)
    return "集計単位の数は400以下にしてください。";
  return null;
}

export function commitAnalysisDraft(draft: AnalysisDraft): AnalysisQuery {
  const error = analysisDraftError(draft);
  if (error) throw new Error(error);
  return {
    since: draft.since,
    until: draft.until,
    bucket:
      draft.bucket === "week" || draft.bucket === "month"
        ? draft.bucket
        : "day",
    author: draft.author.trim(),
    tags: normalizeAnalysisTags(draft.tags),
  };
}

export function toAnalysisDraft(query: AnalysisQuery): AnalysisDraft {
  return { ...query, tags: [...query.tags] };
}

export function analysisQueryParams(query: AnalysisQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("since", query.since);
  params.set("until", query.until);
  if (query.bucket !== "day") params.set("bucket", query.bucket);
  if (query.author) params.set("author", query.author);
  for (const tag of normalizeAnalysisTags(query.tags))
    params.append("tags", tag);
  return params;
}

export function analysisStateParams(state: AnalysisState): URLSearchParams {
  const params = analysisQueryParams(state);
  if (state.metric !== "posts") params.set("metric", state.metric);
  if (state.view !== "table") params.set("view", state.view);
  return params;
}

export function parseAnalysisState(
  params: URLSearchParams,
  now = new Date(),
): AnalysisState {
  const defaults = defaultAnalysisQuery(now);
  const requestedUntil = params.get("until");
  const until =
    requestedUntil && isUtcDate(requestedUntil)
      ? requestedUntil
      : defaults.until;
  const requestedSince = params.get("since");
  const since = requestedSince
    ? isUtcDate(requestedSince)
      ? requestedSince
      : defaults.since
    : requestedUntil
      ? shiftUtcDay(until, -89)
      : defaults.since;
  const bucket = params.get("bucket");
  return {
    since,
    until,
    bucket: bucket === "week" || bucket === "month" ? bucket : "day",
    author: params.get("author")?.trim() ?? "",
    tags: normalizeAnalysisTags(params.getAll("tags")),
    metric: params.get("metric") === "likes" ? "likes" : "posts",
    view: params.get("view") === "chart" ? "chart" : "table",
  };
}

export function analysisBucketStarts(
  since: string,
  until: string,
  bucket: AnalysisBucket,
): string[] {
  const start = new Date(`${since}T00:00:00.000Z`);
  const end = new Date(`${until}T00:00:00.000Z`);
  if (bucket === "week") {
    const mondayOffset = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - mondayOffset);
  } else if (bucket === "month") {
    start.setUTCDate(1);
  }
  const starts: string[] = [];
  while (start <= end) {
    starts.push(start.toISOString().slice(0, 10));
    if (bucket === "day") start.setUTCDate(start.getUTCDate() + 1);
    else if (bucket === "week") start.setUTCDate(start.getUTCDate() + 7);
    else start.setUTCMonth(start.getUTCMonth() + 1);
  }
  return starts;
}

export function validateAnalysisResponse(
  value: unknown,
  query: AnalysisQuery,
): AnalysisRow[] {
  if (!value || typeof value !== "object")
    throw new Error("時系列データの形式が正しくありません");
  const response = value as Record<string, unknown>;
  const starts = analysisBucketStarts(query.since, query.until, query.bucket);
  if (
    response.since !== query.since ||
    response.until !== query.until ||
    response.bucket !== query.bucket ||
    !Array.isArray(response.rows) ||
    response.rows.length !== starts.length
  )
    throw new Error("時系列データの形式が正しくありません");
  return response.rows.map((row: unknown, index: number) => {
    if (
      !row ||
      typeof row !== "object" ||
      (row as AnalysisRow).bucketStart !== starts[index] ||
      !Number.isSafeInteger((row as AnalysisRow).articleCount) ||
      (row as AnalysisRow).articleCount < 0 ||
      !Number.isSafeInteger((row as AnalysisRow).publishedArticleLikes) ||
      (row as AnalysisRow).publishedArticleLikes < 0
    )
      throw new Error("時系列データの形式が正しくありません");
    return row as AnalysisRow;
  });
}

export async function fetchAnalysis(
  query: AnalysisQuery,
  signal: AbortSignal,
): Promise<AnalysisRow[]> {
  const response = await fetch(
    `/api/analysis/time-series?${analysisQueryParams(query)}`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok)
    throw new Error(`時系列データを取得できませんでした (${response.status})`);
  return validateAnalysisResponse(await response.json(), query);
}

export function serializeAnalysisBootstrap(value: AnalysisBootstrap): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function shiftUtcDay(value: string, offset: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function bucketCount(
  since: string,
  until: string,
  bucket: AnalysisBucket,
): number {
  if (bucket === "day") {
    return (
      (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) /
        86_400_000 +
      1
    );
  }
  if (bucket === "month") {
    const start = since.slice(0, 7).split("-").map(Number);
    const end = until.slice(0, 7).split("-").map(Number);
    return (end[0] - start[0]) * 12 + end[1] - start[1] + 1;
  }
  const monday = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.valueOf();
  };
  return (monday(until) - monday(since)) / (7 * 86_400_000) + 1;
}
