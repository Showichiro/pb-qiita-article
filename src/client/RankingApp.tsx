/** @jsxImportSource react */
import {
  Component,
  Suspense,
  useEffect,
  use,
  useCallback,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
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
  fetchRankingData,
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

type RankingData = {
  postCounts: ArticleCountGroupByUser[];
  likesCounts: LikesCountSchema[];
};

export type RankingAppProps = {
  initialConfig: RankingQuery;
  initialPostCounts: ArticleCountGroupByUser[];
  initialLikesCounts: LikesCountSchema[];
  initialDraft?: RankingDraft;
};

type RequestRecord = {
  controller: AbortController;
  promise: Promise<RankingData>;
  state: "pending" | "resolved" | "rejected" | "aborted";
};

const never = new Promise<RankingData>(() => {});

export default function RankingApp({
  initialConfig,
  initialPostCounts,
  initialLikesCounts,
  initialDraft,
}: RankingAppProps) {
  const [query, setQuery] = useState(initialConfig);
  const queryRef = useRef(query);
  const initialData = useRef<RankingData>({
    postCounts: initialPostCounts,
    likesCounts: initialLikesCounts,
  }).current;
  const [result, setResult] = useState<{
    query: RankingRequestQuery;
    data: RankingData | Promise<RankingData>;
  }>({ query: dateQuery(initialConfig), data: initialData });
  const lastSuccessful = useRef({
    query: dateQuery(initialConfig),
    data: initialData,
  });
  const [draft, setDraft] = useState(
    () => initialDraft ?? toRankingDraft(initialConfig),
  );
  const latestDraft = useRef(draft);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requests = useRef(new Map<string, RequestRecord>());
  const active = useRef<{
    key: string;
    record?: RequestRecord;
  }>({ key: rankingRequestKey(initialConfig) });

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

  const startRequest = useCallback(
    (next: RankingQuery, retry = false) => {
      const key = rankingRequestKey(next);
      const current = active.current;
      if (
        !retry &&
        key === current.key &&
        (!current.record ||
          (current.record.state !== "rejected" &&
            current.record.state !== "aborted"))
      ) {
        return current.record?.promise;
      }
      if (current.record?.state === "pending") {
        current.record.controller.abort();
        current.record.state = "aborted";
        if (requests.current.get(current.key) === current.record)
          requests.current.delete(current.key);
      }
      if (retry) {
        const cached = requests.current.get(key);
        if (cached?.state === "pending") cached.controller.abort();
        requests.current.delete(key);
      }

      let record = retry ? undefined : requests.current.get(key);
      if (
        !record ||
        record.state === "aborted" ||
        record.state === "rejected"
      ) {
        const controller = new AbortController();
        const created: RequestRecord = {
          controller,
          state: "pending",
          promise: Promise.resolve(initialData),
        };
        const promise = fetchRankingData(
          dateQuery(next),
          controller.signal,
        ).then(
          (data) => {
            if (controller.signal.aborted) {
              created.state = "aborted";
              if (requests.current.get(key) === created)
                requests.current.delete(key);
              return never;
            }
            created.state = "resolved";
            lastSuccessful.current = { query: dateQuery(next), data };
            return data;
          },
          (error: unknown) => {
            if (
              controller.signal.aborted ||
              (error instanceof Error && error.name === "AbortError")
            ) {
              created.state = "aborted";
              if (requests.current.get(key) === created)
                requests.current.delete(key);
              return never;
            }
            created.state = "rejected";
            if (requests.current.get(key) === created)
              requests.current.delete(key);
            throw error;
          },
        );
        created.promise = promise;
        record = created;
        requests.current.set(key, created);
        void promise.catch(() => {});
        while (requests.current.size > 20) {
          const oldest = requests.current.keys().next().value;
          if (oldest === undefined) break;
          const old = requests.current.get(oldest);
          if (old?.state === "pending") {
            old.controller.abort();
            old.state = "aborted";
          }
          requests.current.delete(oldest);
        }
      }
      active.current = { key, record };
      startTransition(() =>
        setResult({ query: dateQuery(next), data: record.promise }),
      );
      return record.promise;
    },
    [initialData],
  );

  const setCurrentQuery = useCallback((next: RankingQuery) => {
    queryRef.current = next;
    setQuery(next);
  }, []);

  const navigateDates = useCallback(
    (nextDates: RankingRequestQuery) => {
      const next = withRankingDisplay(nextDates, {
        view: queryRef.current.view,
        topN: queryRef.current.topN,
      });
      setCurrentQuery(next);
      setValidationError(null);
      writeSearchUrl(next);
      void startRequest(next);
    },
    [setCurrentQuery, startRequest, writeSearchUrl],
  );

  const changeDisplay = useCallback(
    (display: Pick<RankingQuery, "view" | "topN">) => {
      const next = withRankingDisplay(dateQuery(queryRef.current), display);
      setCurrentQuery(next);
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
    const nextDraft = toRankingDraft(next);
    latestDraft.current = nextDraft;
    setDraft(nextDraft);
    setValidationError(null);
    setCurrentQuery(next);
    if (rankingRequestKey(next) !== active.current.key) void startRequest(next);
  }, [setCurrentQuery, startRequest]);

  useEffect(
    () => () => {
      const current = active.current;
      if (current.record?.state === "pending") {
        current.record.controller.abort();
        current.record.state = "aborted";
        if (requests.current.get(current.key) === current.record)
          requests.current.delete(current.key);
      }
    },
    [],
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
        <div role="status" aria-live="polite">
          {isPending ? "読み込み中…" : ""}
        </div>
        <ResultsBoundary
          resource={result.data}
          retry={() => void startRequest(queryRef.current, true)}
          fallback={
            <RankingResults
              query={query}
              result={{ ...lastSuccessful.current }}
              isPending={false}
            />
          }
        >
          <Suspense fallback={<p role="status">読み込み中…</p>}>
            <RankingResults
              query={query}
              result={result}
              isPending={isPending}
            />
          </Suspense>
        </ResultsBoundary>
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
    data: RankingData | Promise<RankingData>;
  };
  isPending: boolean;
};

function RankingResults({ query, result, isPending }: ResultsProps) {
  const data = result.data instanceof Promise ? use(result.data) : result.data;
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

type ResultsBoundaryProps = {
  resource: RankingData | Promise<RankingData>;
  retry: () => void;
  fallback: ReactNode;
  children: ReactNode;
};

class ResultsBoundary extends Component<
  ResultsBoundaryProps,
  { resource: ResultsBoundaryProps["resource"]; error: Error | null }
> {
  state = { resource: this.props.resource, error: null as Error | null };
  static getDerivedStateFromProps(
    props: ResultsBoundaryProps,
    state: { resource: ResultsBoundaryProps["resource"] },
  ) {
    return props.resource !== state.resource
      ? { resource: props.resource, error: null }
      : null;
  }
  static getDerivedStateFromError(error: unknown) {
    return {
      error:
        error instanceof Error
          ? error
          : new Error("ランキングを取得できませんでした"),
    };
  }
  render() {
    if (this.state.error)
      return (
        <>
          <div role="alert">
            <p>{this.state.error.message}</p>
            <Button variant="outline" onClick={this.props.retry}>
              再試行
            </Button>
          </div>
          {this.props.fallback}
        </>
      );
    return this.props.children;
  }
}
