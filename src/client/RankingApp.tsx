/** @jsxImportSource react */
import { japanDate } from "@/util/japanTime";
import { PeriodShortcuts } from "./PeriodShortcuts";
import { ActiveFilters } from "./active-filters";
import { commonFilters } from "@/client/filter-state";
import { FilterSheet } from "./filter-sheet";
import {
  useCallback,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useIsFetching, useSuspenseQueries } from "@tanstack/react-query";
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
  rankingFieldId,
  rankingIslandClass,
  rankingCardExtraClass,
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
import {
  queryTask,
  useRequestIntent,
  useVersionedQuery,
} from "./hooks/useVersionedQuery";
import { rankingSearchParsers } from "./search-params";
import { useSearchParams } from "./hooks/useSearchParams";
import { rankingLikesQueryOptions, rankingPostsQueryOptions } from "./queries";
import { isDataQuery, useRemovePreviousGeneration } from "./query-client";

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
  const requestIntent = useRequestIntent();
  const [isPending, startTransition] = useTransition();
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
    [requestIntent],
  );

  const commitQuery = useCallback(
    (next: RankingQuery, intent: number) => {
      startTransition(() =>
        setCurrentQuery(
          withRankingDisplay(dateQuery(next), queryRef.current),
          intent,
        ),
      );
    },
    [setCurrentQuery],
  );
  const { versionState, load, requestFailure, retryFailedQuery, refresh } =
    useVersionedQuery({
      initialVersion: initialDataVersion,
      requestIntent,
      normalize: normalizeRankingLoad,
      tasks: rankingTasks,
      commit: commitQuery,
      errorMessage: "ランキングを取得できませんでした",
    });
  const { adoptedVersion } = versionState;
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

  const { write } = useSearchParams(rankingSearchParsers, (params, initial) => {
    let next: RankingQuery;
    try {
      next = parseRankingQuery(params);
    } catch (error) {
      requestIntent.current++;
      setValidationError(
        error instanceof Error ? error.message : "検索条件を確認してください",
      );
      return;
    }
    if (
      initial &&
      rankingQueryParams(next).toString() ===
        rankingQueryParams(initialConfig).toString()
    )
      return;
    const sameDates = rankingRequestKey(next) === rankingRequestKey(query);
    queryRef.current = next;
    const nextDraft = toRankingDraft(next);
    latestDraft.current = nextDraft;
    setDraft(nextDraft);
    setValidationError(null);
    if (sameDates) setCurrentQuery(next, ++requestIntent.current);
    else {
      setQuery((current) =>
        withRankingDisplay(dateQuery(current), {
          view: next.view,
          topN: next.topN,
        }),
      );
      void load(next);
    }
  });
  const writeSearchUrl = useCallback(
    (next: RankingQuery) => {
      void write(rankingQueryParams(next));
    },
    [write],
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
    [writeSearchUrl],
  );

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
  const refreshData = () =>
    refresh(
      () => {
        const next = { ...queryRef.current };
        latestDraft.current = toRankingDraft(next);
        setValidationError(null);
        return next;
      },
      (next, version, intent) => {
        startTransition(() => {
          versionState.setAdoptedVersion((current) =>
            requestIntent.current === intent ? version : current,
          );
          setCurrentQuery(next, intent);
          setDraft((current) =>
            requestIntent.current === intent ? latestDraft.current : current,
          );
        });
      },
    );
  const changePeriod = (patch: Record<string, string | string[]>) => {
    const next = { ...latestDraft.current, ...patch };
    latestDraft.current = next;
    setDraft(next);
    const error = validateRankingDraft(next);
    setValidationError(error);
    if (!error) navigateDates(commitRankingDraft(next));
  };
  const result = { query: resultQuery, data };

  return (
    <section className={rankingIslandClass} aria-label="ランキング検索">
      <Card className={rankingCardExtraClass}>
        <PeriodShortcuts
          range={draft}
          onChange={(range) => {
            const next = { ...latestDraft.current, ...range };
            latestDraft.current = next;
            setDraft(next);
            const error = validateRankingDraft(next);
            setValidationError(error);
            if (!error) navigateDates(commitRankingDraft(next));
          }}
        />
        <form
          data-ranking-action=""
          tabIndex={-1}
          id="ranking-filters-form"
          action="/ranking"
          method="get"
          onSubmit={handleSubmit}
          className="query-form"
        >
          <FilterSheet
            id="ranking-filters"
            count={commonFilters(query).length}
            controls={
              <>
                <label htmlFor={rankingFieldId("view")}>
                  表示形式{" "}
                  <Select
                    id={rankingFieldId("view")}
                    name="view"
                    value={query.view}
                    onChange={(event) =>
                      changeDisplay({
                        view:
                          event.currentTarget.value === "chart"
                            ? "chart"
                            : "table",
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
              </>
            }
          >
            <fieldset className="filter-field-group">
              <legend>投稿期間</legend>
              <label htmlFor={rankingFieldId("since")}>
                開始日{" "}
                <Input
                  type="date"
                  id={rankingFieldId("since")}
                  name="since"
                  value={draft.since ? japanDate(draft.since) : ""}
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
                  value={draft.until ? japanDate(draft.until) : ""}
                  onChange={(event) =>
                    handleDateChange("until", event.currentTarget.value)
                  }
                />
              </label>
            </fieldset>

            {validationError && <p role="alert">{validationError}</p>}
          </FilterSheet>
          <ActiveFilters
            filters={commonFilters(query)}
            onRemove={(filter) => changePeriod(filter.clear)}
            onClear={() => changePeriod({ since: "", until: "" })}
          />{" "}
        </form>
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

function normalizeRankingLoad(query: RankingQuery): RankingQuery {
  return query;
}
function rankingTasks(version: string, query: RankingQuery) {
  return [
    queryTask(rankingPostsQueryOptions(version, dateQuery(query))),
    queryTask(rankingLikesQueryOptions(version, dateQuery(query))),
  ];
}
