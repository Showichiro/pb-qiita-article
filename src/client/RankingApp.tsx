/** @jsxImportSource react */
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  useIsFetching,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import {
  Button,
  Card,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui";
import {
  rankingChartFrameClass,
  rankingActionClass,
  rankingFieldId,
  rankingIslandClass,
  rankingCardExtraClass,
  rankingFormClass,
  rankingLinkClass,
  rankingResultsClass,
} from "./ranking-presentation";
import {
  likesCountForChart,
  parseRankingQuery,
  rankingQueryParams,
  rankingRequestKey,
  toRankingDraft,
  type RankingDraft,
  type RankingQuery,
  type RankingRequestQuery,
  validateRankingDraft,
  commitRankingDraft,
  withRankingDisplay,
} from "./ranking";
import { DataVersionControls } from "./data-version-controls";
import { useDataVersion } from "./data-version";
import {
  rankingLikesQueryOptions,
  rankingPostsQueryOptions,
} from "./queries";
import {
  isDataQuery,
  protectDataQueries,
  useRemovePreviousGeneration,
} from "./query-client";

type RankingData = {
  postCounts: ArticleCountGroupByUser[];
  likesCounts: LikesCountSchema[];
};

export type RankingAppProps = {
  initialConfig: RankingQuery;
  initialPostCounts: ArticleCountGroupByUser[];
  initialLikesCounts: LikesCountSchema[];
  initialDataVersion: string;
  initialDraft?: RankingDraft;
};

export default function RankingApp({
  initialConfig,
  initialDataVersion,
  initialDraft,
}: RankingAppProps) {
  const [query, setQuery] = useState(initialConfig);
  const queryRef = useRef(query);
  const versionState = useDataVersion(initialDataVersion);
  const { adoptedVersion } = versionState;
  const queryClient = useQueryClient();
  const dates = dateQuery(query);
  const queryResults = useSuspenseQueries({
    queries: [
      rankingPostsQueryOptions(adoptedVersion, dates),
      rankingLikesQueryOptions(adoptedVersion, dates),
    ],
  });
  const data: RankingData = {
    postCounts: queryResults[0].data.rows,
    likesCounts: queryResults[1].data.rows,
  };
  const resultQuery = queryResults[0].data.query;
  const isFetching = useIsFetching({
    predicate: (activeQuery) =>
      isDataQuery(activeQuery) && activeQuery.queryKey[0] === "ranking",
  });
  useRemovePreviousGeneration(adoptedVersion);
  const [draft, setDraft] = useState(
    () => initialDraft ?? toRankingDraft(initialConfig),
  );
  const latestDraft = useRef(draft);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestFailure, setRequestFailure] = useState<{
    error: Error;
    query: RankingQuery;
    version: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIntent = useRef(0);

  const setCurrentQuery = useCallback(
    (next: RankingQuery, intent?: number) => {
      if (intent !== undefined && requestIntent.current !== intent) return;
      queryRef.current = next;
      setQuery((current) =>
        intent === undefined || requestIntent.current === intent
          ? next
          : current,
      );
    },
    [],
  );

  const writeSearchUrl = useCallback((next: RankingQuery) => {
    const canonical = rankingQueryParams(next).toString();
    const current = rankingQueryParams(
      parseRankingQuery(new URLSearchParams(window.location.search)),
    ).toString();
    if (canonical === current) return;
    const url = new URL(window.location.href);
    for (const key of ["since", "until", "view", "topN"])
      url.searchParams.delete(key);
    rankingQueryParams(next).forEach((value, key) => {
      url.searchParams.append(key, value);
    });
    window.history.pushState(null, "", url);
  }, []);

  const load = useCallback(
    async (
      next: RankingQuery,
      options: {
        version?: string;
        force?: boolean;
        commit?: boolean;
        intent?: number;
        onSuccess?: (intent: number) => void;
      } = {},
    ): Promise<boolean> => {
      const requestQuery = dateQuery(next);
      const version = options.version ?? adoptedVersion;
      const intent = options.intent ?? ++requestIntent.current;
      const postsOptions = rankingPostsQueryOptions(version, requestQuery);
      const likesOptions = rankingLikesQueryOptions(version, requestQuery);
      setRequestFailure(null);
      const releaseProtection = protectDataQueries([
        postsOptions.queryKey,
        likesOptions.queryKey,
      ]);
      try {
        await Promise.all([
          queryClient.prefetchQuery(
            options.force
              ? { ...postsOptions, staleTime: 0 }
              : postsOptions,
          ),
          queryClient.prefetchQuery(
            options.force
              ? { ...likesOptions, staleTime: 0 }
              : likesOptions,
          ),
        ]);
        for (const queryOptions of [postsOptions, likesOptions]) {
          const data = queryClient.getQueryData(queryOptions.queryKey);
          const state = queryClient.getQueryState(queryOptions.queryKey);
          if (
            data === undefined ||
            (options.force && state?.status === "error")
          )
            throw state?.error ?? new Error("ランキングを取得できませんでした");
        }
        if (requestIntent.current !== intent) {
          releaseProtection();
          return false;
        }
        if (options.onSuccess) options.onSuccess(intent);
        else if (options.commit !== false)
          startTransition(() => setCurrentQuery(withRankingDisplay(dateQuery(next), queryRef.current), intent));
        return true;
      } catch (error) {
        releaseProtection();
        if (requestIntent.current !== intent) return false;
        const normalizedError =
          error instanceof Error
            ? error
            : new Error("ランキングを取得できませんでした");
        setRequestFailure({ error: normalizedError, query: next, version });
        versionState.reportError(normalizedError);
        return false;
      }
    },
    [
      adoptedVersion,
      queryClient,
      setCurrentQuery,
      startTransition,
      versionState.reportError,
    ],
  );

  const navigateDates = useCallback(
    (nextDates: RankingRequestQuery) => {
      const next = withRankingDisplay(nextDates, {
        view: queryRef.current.view,
        topN: queryRef.current.topN,
      });
      queryRef.current = next;
      setValidationError(null);
      writeSearchUrl(next);
      void load(next);
    },
    [load, writeSearchUrl],
  );

  const changeDisplay = useCallback(
    (display: Pick<RankingQuery, "view" | "topN">) => {
      const next = withRankingDisplay(dateQuery(queryRef.current), display);
      queryRef.current = next;
      setQuery((current) => withRankingDisplay(dateQuery(current), display));
      writeSearchUrl(next);
    },
    [setCurrentQuery, writeSearchUrl],
  );

  const onPopState = useCallback(() => {
    let next: RankingQuery;
    try {
      next = parseRankingQuery(new URLSearchParams(window.location.search));
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "検索条件を確認してください",
      );
      return;
    }
    queryRef.current = next;
    const nextDraft = toRankingDraft(next);
    latestDraft.current = nextDraft;
    setDraft(nextDraft);
    setValidationError(null);
    if (rankingRequestKey(next) === rankingRequestKey(queryRef.current)) {
      const intent = ++requestIntent.current;
      setCurrentQuery(next, intent);
    } else {
      void load(next);
    }
  }, [load, setCurrentQuery]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentDraft = { ...latestDraft.current };
    const error = validateRankingDraft(currentDraft);
    if (error) {
      setValidationError(error);
      return;
    }
    navigateDates(commitRankingDraft(currentDraft));
  };

  const handleDateChange = (field: "since" | "until", value: string) => {
    const nextDraft = { ...latestDraft.current, [field]: value };
    latestDraft.current = nextDraft;
    setDraft(nextDraft);
    setValidationError(null);
    if (validateRankingDraft(nextDraft) === null)
      navigateDates(commitRankingDraft(nextDraft));
  };
  const retryFailedQuery = () => {
    if (requestFailure)
      void load(requestFailure.query, {
        version: requestFailure.version,
        force: true,
      });
  };
  const refreshData = async () => {
    const intent = ++requestIntent.current;
    let version: string;
    try {
      version = await versionState.checkLatestVersion();
    } catch (error) {
      versionState.reportError(error);
      return;
    }
    if (requestIntent.current !== intent) return;
    const next = { ...queryRef.current };
    latestDraft.current = toRankingDraft(next);
    setValidationError(null);
    await load(next, {
      version,
      force: true,
      commit: false,
      intent,
      onSuccess: (request) => {
        if (requestIntent.current !== request) return;
        startTransition(() => {
          versionState.setAdoptedVersion((current) =>
            requestIntent.current === request ? version : current,
          );
          setCurrentQuery(next, request);
          setDraft((current) =>
            requestIntent.current === request ? latestDraft.current : current,
          );
        });
      },
    });
  };
  const result = { query: resultQuery, data };

  return (
    <section className={rankingIslandClass} aria-label="ランキング検索">
      <HistorySubscription onPopState={onPopState} />
      <Card className={rankingCardExtraClass}>
        <form
          action="/ranking"
          method="get"
          onSubmit={handleSubmit}
          className={rankingFormClass}
        >
          <label htmlFor={rankingFieldId("since")}>
            開始日{" "}
            <Input
              type="date"
              id={rankingFieldId("since")}
              name="since"
              value={draft.since.slice(0, 10)}
              onChange={(event) =>
                handleDateChange("since", event.currentTarget.value)
              }
            />
          </label>
          <label htmlFor={rankingFieldId("until")}>
            終了日{" "}
            <Input
              type="date"
              id={rankingFieldId("until")}
              name="until"
              value={draft.until.slice(0, 10)}
              onChange={(event) =>
                handleDateChange("until", event.currentTarget.value)
              }
            />
          </label>
          <label htmlFor={rankingFieldId("view")}>
            表示形式{" "}
            <Select
              id={rankingFieldId("view")}
              name="view"
              value={query.view}
              onChange={(event) =>
                changeDisplay({
                  view:
                    event.currentTarget.value === "chart" ? "chart" : "table",
                  topN: queryRef.current.topN,
                })
              }
            >
              <option value="table">表</option>
              <option value="chart">グラフ</option>
            </Select>
          </label>
          <label htmlFor={rankingFieldId("topN")}>
            表示件数{" "}
            <Select
              id={rankingFieldId("topN")}
              name="topN"
              value={String(query.topN)}
              onChange={(event) =>
                changeDisplay({
                  view: queryRef.current.view,
                  topN: parseTopNControl(event.currentTarget.value),
                })
              }
            >
              {Array.from({ length: 100 }, (_, index) => index + 1).map(
                (count) => (
                  <option key={count} value={count}>
                    {count}件
                  </option>
                ),
              )}
            </Select>
          </label>
          <span
            data-ranking-action=""
            tabIndex={-1}
            className={`${rankingActionClass} text-muted-foreground`}
          >
            自動検索
          </span>
        </form>
        {validationError && <p role="alert">{validationError}</p>}
        <DataVersionControls
          availableVersion={versionState.availableVersion}
          error={versionState.error}
          isBusy={isFetching > 0 || isPending}
          isChecking={versionState.isChecking}
          onRefresh={() => void refreshData()}
          onCheck={() =>
            void versionState
              .checkLatestVersion()
              .catch(versionState.reportError)
          }
        />
        {requestFailure && (
          <div role="alert">
            {requestFailure.error !== versionState.error && (
              <p>{requestFailure.error.message}</p>
            )}
            <Button variant="outline" onClick={retryFailedQuery}>
              再試行
            </Button>
          </div>
        )}
        <div role="status" aria-live="polite">
          {isPending || isFetching > 0 ? "読み込み中…" : ""}
        </div>
        <RankingResults
          query={query}
          result={result}
          isPending={isPending || isFetching > 0}
        />
      </Card>
    </section>
  );
}

function HistorySubscription({ onPopState }: { onPopState: () => void }) {
  useEffect(() => {
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [onPopState]);
  return null;
}

type ResultsProps = {
  query: RankingQuery;
  result: {
    query: RankingRequestQuery;
    data: RankingData;
  };
  isPending: boolean;
};

function RankingResults({ query, result, isPending }: ResultsProps) {
  const data = result.data;
  const postRows = data.postCounts.slice(0, query.topN);
  const likeRows = data.likesCounts.slice(0, query.topN);
  const resultPeriod = describePeriod(result.query);
  return (
    <>
      <div role="status" aria-live="polite">
        {postRows.length}件の投稿, {likeRows.length}件のいいね
        {isPending && " (更新中)"}
        <span className="sr-only">対象期間: {resultPeriod}</span>
      </div>
      {data.postCounts.length === 0 && data.likesCounts.length === 0 && (
        <p role="status">該当するデータはありません。</p>
      )}
      <div className={rankingResultsClass} aria-busy={isPending}>
        <div className="grid grid-rows-2 gap-4">
          <section aria-labelledby="posts">
            <h2 id="posts" className="text-3xl">
              記事数ランキング
            </h2>
            {query.view === "chart" && <PostChart rows={postRows} />}
            <RankingTable
              kind="posts"
              rows={postRows}
              emptyMessage="記事数データはありません。"
            />
          </section>
          <section aria-labelledby="likes">
            <h2 id="likes" className="text-3xl">
              いいね数ランキング
            </h2>
            <p>期間内に公開された記事の現在の合計いいね数です。</p>
            {query.view === "chart" && <LikesChart rows={likeRows} />}
            <RankingTable
              kind="likes"
              rows={likeRows}
              emptyMessage="いいね数データはありません。"
            />
          </section>
        </div>
      </div>
    </>
  );
}

function PostChart({ rows }: { rows: ArticleCountGroupByUser[] }) {
  return (
    <div className={rankingChartFrameClass}>
      {rows.length === 0 ? (
        <p role="status">グラフに表示する記事数データはありません。</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            title="記事数ランキング"
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="userId"
              width={96}
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Bar dataKey="count" name="記事数" fill="var(--color-primary)" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function LikesChart({ rows }: { rows: LikesCountSchema[] }) {
  const chartRows = rows.map((row) => ({
    ...row,
    chartLikes: likesCountForChart(row.totalLikesCount),
  }));
  return (
    <div className={rankingChartFrameClass}>
      {chartRows.length === 0 ? (
        <p role="status">グラフに表示するいいね数データはありません。</p>
      ) : chartRows.every((row) => row.chartLikes === null) ? (
        <p role="status">
          安全にグラフ表示できるいいね数がありません。表の値をご確認ください。
        </p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartRows}
            layout="vertical"
            title="記事の現在の合計いいね数ランキング"
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="userId"
              width={96}
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Bar
              dataKey="chartLikes"
              name="現在の合計いいね数"
              fill="var(--color-primary)"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function RankingTable({
  kind,
  rows,
  emptyMessage,
}: {
  kind: "posts" | "likes";
  rows: ArticleCountGroupByUser[] | LikesCountSchema[];
  emptyMessage: string;
}) {
  return (
    <Table
      aria-label={kind === "posts" ? "記事数ランキング" : "いいね数ランキング"}
    >
      <TableHeader>
        <TableRow>
          <TableHead>順位</TableHead>
          <TableHead>執筆者</TableHead>
          <TableHead>{kind === "posts" ? "記事数" : "いいね数"}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3}>{emptyMessage}</TableCell>
          </TableRow>
        ) : (
          rows.map((user, index) => {
            const count =
              kind === "posts" && "count" in user
                ? user.count
                : kind === "likes" && "totalLikesCount" in user
                  ? (user.totalLikesCount ?? "—")
                  : "—";
            return (
              <TableRow key={`${kind}-${user.userId}`}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <a
                    className={rankingLinkClass}
                    href={`https://qiita.com/${encodeURIComponent(user.userId)}`}
                    target={kind === "posts" ? "_blank" : undefined}
                    rel="noopener noreferrer"
                  >
                    {user.userId}
                    <span>{user.userName !== "" && `(${user.userName})`}</span>
                  </a>
                </TableCell>
                <TableCell>{count}</TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function dateQuery(query: RankingRequestQuery): RankingRequestQuery {
  return { since: query.since, until: query.until };
}

function describePeriod(query: RankingRequestQuery): string {
  if (!query.since && !query.until) return "全期間";
  return `${query.since || "指定なし"} から ${query.until || "指定なし"}`;
}

function parseTopNControl(value: string): number {
  const count = Number(value);
  return Number.isInteger(count) ? Math.max(1, Math.min(100, count)) : 10;
}
