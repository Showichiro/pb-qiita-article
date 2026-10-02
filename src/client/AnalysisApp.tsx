/** @jsxImportSource react */
import {
  Component,
  Suspense,
  lazy,
  use,
  useCallback,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
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
  analysisDraftError,
  analysisQueryParams,
  analysisStateParams,
  commitAnalysisDraft,
  fetchAnalysis,
  normalizeAnalysisTags,
  parseAnalysisState,
  toAnalysisDraft,
  type AnalysisBootstrap,
  type AnalysisDraft,
  type AnalysisMetric,
  type AnalysisQuery,
  type AnalysisRow,
  type AnalysisView,
} from "./analysis";
import {
  analysisCardClass,
  analysisActionFocusId,
  analysisActionHintClass,
  analysisActionSlotClass,
  analysisChartClass,
  analysisChartText,
  analysisFieldClass,
  analysisFieldId,
  analysisFormClass,
  analysisIslandClass,
  analysisNoteClass,
  analysisResultsClass,
  analysisTagClearClass,
  analysisTagClearFocusId,
  analysisTagFieldClass,
  analysisTagLabelClass,
  analysisTagsClass,
} from "./analysis-presentation";
import { useDebouncedAction } from "./hooks/useDebouncedAction";

const LazyAnalysisChart = lazy(() =>
  import("./analysis-chart").then(({ AnalysisChart }) => ({
    default: AnalysisChart,
  })),
);

export type AnalysisAppProps = {
  initialData: AnalysisBootstrap;
  initialDraft?: AnalysisDraft;
  initialMetric?: AnalysisMetric;
  initialView?: AnalysisView;
};

export default function AnalysisApp({
  initialData,
  initialDraft,
  initialMetric,
  initialView,
}: AnalysisAppProps) {
  const initialQuery: AnalysisQuery = {
    since: initialData.state.since,
    until: initialData.state.until,
    bucket: initialData.state.bucket,
    author: initialData.state.author,
    tags: [...initialData.state.tags],
  };
  const [result, setResult] = useState<{
    query: AnalysisQuery;
    data: AnalysisRow[] | Promise<AnalysisRow[]>;
  }>(() => ({ query: initialQuery, data: initialData.rows }));
  const [draft, setDraft] = useState(
    () => initialDraft ?? toAnalysisDraft(initialQuery),
  );
  const latestDraft = useRef(draft);
  const bootstrapClock = useRef(
    new Date(`${initialData.state.until}T12:00:00.000Z`),
  ).current;
  const [metric, setMetric] = useState(
    () => initialMetric ?? initialData.state.metric,
  );
  const [view, setView] = useState(() => initialView ?? initialData.state.view);
  const composingRef = useRef(false);
  const [validationError, setValidationError] = useState<string | null>(() =>
    analysisDraftError(draft),
  );
  const [isPending, startTransition] = useTransition();
  const active = useRef<{
    query: AnalysisQuery;
    canonical: string;
    controller?: AbortController;
    request?: Promise<AnalysisRow[]>;
  }>({
    query: initialQuery,
    canonical: analysisQueryParams(initialQuery).toString(),
  });
  const acceptedQuery = useRef(initialQuery);

  const load = useCallback(
    (query: AnalysisQuery, retry = false): Promise<AnalysisRow[]> => {
      const canonical = analysisQueryParams(query).toString();
      if (
        !retry &&
        active.current.canonical === canonical &&
        !active.current.controller?.signal.aborted
      )
        return active.current.request ?? Promise.resolve(initialData.rows);

      active.current.controller?.abort();
      const controller = new AbortController();
      active.current = { query, canonical, controller };
      const request = fetchAnalysis(query, controller.signal);
      const data = request.catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return pendingRows;
        if (active.current.controller === controller)
          active.current.canonical = "";
        throw error;
      });
      active.current.request = data;
      void data.catch(() => {});
      startTransition(() => setResult({ query, data }));
      return data;
    },
    [initialData.rows],
  );

  const writeUrl = useCallback(
    (
      query: AnalysisQuery,
      nextMetric: AnalysisMetric,
      nextView: AnalysisView,
    ) => {
      const next = {
        ...query,
        metric: nextMetric,
        view: nextView,
      };
      const params = analysisStateParams(next);
      const currentState = parseAnalysisState(
        new URLSearchParams(window.location.search),
        bootstrapClock,
      );
      if (analysisStateParams(currentState).toString() === params.toString())
        return;
      const url = new URL(window.location.href);
      for (const name of [
        "since",
        "until",
        "bucket",
        "author",
        "tags",
        "metric",
        "view",
      ])
        url.searchParams.delete(name);
      params.forEach((value, name) => {
        url.searchParams.append(name, value);
      });
      window.history.pushState(null, "", url);
    },
    [bootstrapClock],
  );

  const acceptDraft = useCallback(
    (nextDraft: AnalysisDraft) => {
      const query = commitAnalysisDraft(nextDraft);
      acceptedQuery.current = query;
      latestDraft.current = toAnalysisDraft(query);
      setDraft(latestDraft.current);
      setValidationError(null);
      writeUrl(query, metric, view);
      void load(query);
    },
    [load, metric, view, writeUrl],
  );

  const runDebouncedSearch = useCallback(
    async (_scheduledDraft: AnalysisDraft, signal: AbortSignal) => {
      if (signal.aborted) return;
      const currentDraft = latestDraft.current;
      if (analysisDraftError(currentDraft)) return;
      acceptDraft(currentDraft);
    },
    [acceptDraft],
  );
  const debouncedSearch = useDebouncedAction(runDebouncedSearch, {
    intervalMs: 500,
    startTransition,
    isValid: (value) => analysisDraftError(value) === null,
    areEqual: (a, b) =>
      analysisDraftError(a) === null &&
      analysisDraftError(b) === null &&
      analysisQueryParams(commitAnalysisDraft(a)).toString() ===
        analysisQueryParams(commitAnalysisDraft(b)).toString(),
  });

  const updateDraft = useCallback(
    (field: keyof AnalysisDraft, value: string | string[]) => {
      const next = { ...latestDraft.current, [field]: value };
      latestDraft.current = next;
      setDraft(next);
      setValidationError(analysisDraftError(next));
      return next;
    },
    [],
  );

  const scheduleSearch = useCallback(
    (next: AnalysisDraft, immediate: boolean) => {
      const error = analysisDraftError(next);
      setValidationError(error);
      if (error) {
        debouncedSearch.cancel();
        return;
      }
      if (immediate) {
        debouncedSearch.cancel();
        acceptDraft(next);
      } else {
        debouncedSearch.trigger(next);
      }
    },
    [acceptDraft, debouncedSearch.cancel, debouncedSearch.trigger],
  );

  const handleAuthorChange = useCallback(
    (value: string, composing: boolean) => {
      const next = updateDraft("author", value);
      if (composing || composingRef.current) debouncedSearch.cancel();
      else scheduleSearch(next, false);
    },
    [debouncedSearch.cancel, scheduleSearch, updateDraft],
  );

  const handleImmediateChange = useCallback(
    (field: "since" | "until" | "bucket" | "tags", value: string | string[]) =>
      scheduleSearch(updateDraft(field, value), true),
    [scheduleSearch, updateDraft],
  );

  const setDisplay = useCallback(
    (nextMetric: AnalysisMetric, nextView: AnalysisView) => {
      setMetric(nextMetric);
      setView(nextView);
      writeUrl(acceptedQuery.current, nextMetric, nextView);
    },
    [writeUrl],
  );

  const subscribeHistory = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const onPop = () => {
        debouncedSearch.cancel();
        const state = parseAnalysisState(
          new URLSearchParams(window.location.search),
          bootstrapClock,
        );
        const query: AnalysisQuery = {
          since: state.since,
          until: state.until,
          bucket: state.bucket,
          author: state.author,
          tags: state.tags,
        };
        acceptedQuery.current = query;
        const nextDraft = toAnalysisDraft(query);
        latestDraft.current = nextDraft;
        setDraft(nextDraft);
        setMetric(state.metric);
        setView(state.view);
        setValidationError(null);
        void load(query);
      };
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
        active.current.controller?.abort();
        debouncedSearch.cancel();
      };
    },
    [bootstrapClock, debouncedSearch.cancel, load],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = latestDraft.current;
    const error = analysisDraftError(current);
    setValidationError(error);
    if (error) {
      debouncedSearch.cancel();
      return;
    }
    debouncedSearch.cancel();
    acceptDraft(current);
  };

  const tagOptions = normalizeAnalysisTags([
    ...initialData.tagOptions,
    ...draft.tags,
  ]);
  const clearTagsQuery =
    analysisDraftError(draft) === null
      ? commitAnalysisDraft(draft)
      : acceptedQuery.current;
  const clearTagsHref = `/analysis?${analysisStateParams({
    ...clearTagsQuery,
    tags: [],
    metric,
    view,
  })}`;
  return (
    <section
      ref={subscribeHistory}
      className={analysisIslandClass}
      aria-label="時系列分析"
    >
      <Card className={analysisCardClass}>
        <form
          action="/analysis"
          method="get"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.nativeEvent.isComposing ||
              composingRef.current ||
              !(event.target instanceof HTMLInputElement)
            )
              return;
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }}
          className={analysisFormClass}
        >
          <label
            className={analysisFieldClass}
            htmlFor={analysisFieldId("since")}
          >
            開始日（UTC）{" "}
            <Input
              id={analysisFieldId("since")}
              name="since"
              type="date"
              value={draft.since}
              aria-describedby={
                validationError ? "analysis-validation" : undefined
              }
              onChange={(event) =>
                handleImmediateChange("since", event.currentTarget.value)
              }
            />
          </label>
          <label
            className={analysisFieldClass}
            htmlFor={analysisFieldId("until")}
          >
            終了日（UTC）{" "}
            <Input
              id={analysisFieldId("until")}
              name="until"
              type="date"
              value={draft.until}
              aria-describedby={
                validationError ? "analysis-validation" : undefined
              }
              onChange={(event) =>
                handleImmediateChange("until", event.currentTarget.value)
              }
            />
          </label>
          <label
            className={analysisFieldClass}
            htmlFor={analysisFieldId("bucket")}
          >
            集計単位{" "}
            <Select
              id={analysisFieldId("bucket")}
              name="bucket"
              value={draft.bucket}
              onChange={(event) =>
                handleImmediateChange("bucket", event.currentTarget.value)
              }
            >
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">月</option>
            </Select>
          </label>
          <label
            className={analysisFieldClass}
            htmlFor={analysisFieldId("author")}
          >
            投稿者（ID・名前）{" "}
            <Input
              id={analysisFieldId("author")}
              name="author"
              value={draft.author}
              onChange={(event) =>
                handleAuthorChange(
                  event.currentTarget.value,
                  event.nativeEvent instanceof InputEvent &&
                    event.nativeEvent.isComposing,
                )
              }
              onCompositionStart={() => {
                composingRef.current = true;
                debouncedSearch.cancel();
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                handleAuthorChange(event.currentTarget.value, false);
              }}
            />
          </label>
          <div
            className={analysisTagFieldClass}
            data-slot="analysis-tags-field"
          >
            <label
              className={analysisTagLabelClass}
              htmlFor={analysisFieldId("tags")}
            >
              タグ（すべて一致）{" "}
              <Select
                id={analysisFieldId("tags")}
                name="tags"
                multiple
                size={4}
                className={analysisTagsClass}
                wrapperClassName={analysisTagsClass}
                value={draft.tags}
                onChange={(event) =>
                  handleImmediateChange(
                    "tags",
                    Array.from(
                      event.currentTarget.selectedOptions,
                      (option) => option.value,
                    ),
                  )
                }
              >
                {tagOptions.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </Select>
            </label>
            <a
              href={clearTagsHref}
              className={analysisTagClearClass}
              data-focus-id={analysisTagClearFocusId}
              onClick={(event) => {
                event.preventDefault();
                handleImmediateChange("tags", []);
              }}
            >
              タグを解除
            </a>
          </div>
          <label
            className={analysisFieldClass}
            htmlFor={analysisFieldId("metric")}
          >
            指標{" "}
            <Select
              id={analysisFieldId("metric")}
              name="metric"
              value={metric}
              onChange={(event) =>
                setDisplay(
                  event.currentTarget.value === "likes" ? "likes" : "posts",
                  view,
                )
              }
            >
              <option value="posts">記事数</option>
              <option value="likes">いいね数</option>
            </Select>
          </label>
          <label
            className={analysisFieldClass}
            htmlFor={analysisFieldId("view")}
          >
            表示{" "}
            <Select
              id={analysisFieldId("view")}
              name="view"
              value={view}
              onChange={(event) =>
                setDisplay(
                  metric,
                  event.currentTarget.value === "chart" ? "chart" : "table",
                )
              }
            >
              <option value="table">表</option>
              <option value="chart">グラフ</option>
            </Select>
          </label>
          <div
            className={analysisActionSlotClass}
            data-slot="analysis-search-action"
          >
            <span
              className={analysisActionHintClass}
              data-focus-id={analysisActionFocusId}
              tabIndex={-1}
            >
              自動検索
            </span>
          </div>
        </form>
        {validationError && (
          <p id="analysis-validation" role="alert">
            {validationError}
          </p>
        )}
        <p className={analysisNoteClass}>
          いいね数は各期間に公開された記事の現在値であり、その期間中に獲得した数ではありません。
        </p>
        {isPending && (
          <div role="status" aria-live="polite">
            読み込み中…
          </div>
        )}
        <AnalysisResults
          result={result}
          metric={metric}
          view={view}
          isPending={isPending}
          retry={() => {
            debouncedSearch.cancel();
            void load(active.current.query, true);
          }}
        />
      </Card>
    </section>
  );
}

function AnalysisResults({
  result,
  metric,
  view,
  isPending,
  retry,
}: {
  result: {
    query: AnalysisQuery;
    data: AnalysisRow[] | Promise<AnalysisRow[]>;
  };
  metric: AnalysisMetric;
  view: AnalysisView;
  isPending: boolean;
  retry: () => void;
}) {
  return (
    <AnalysisErrorBoundary resource={result.data} retry={retry}>
      <Suspense fallback={<p role="status">読み込み中…</p>}>
        <ResolvedAnalysis
          result={result}
          metric={metric}
          view={view}
          isPending={isPending}
        />
      </Suspense>
    </AnalysisErrorBoundary>
  );
}

function ResolvedAnalysis({
  result,
  metric,
  view,
  isPending,
}: {
  result: {
    query: AnalysisQuery;
    data: AnalysisRow[] | Promise<AnalysisRow[]>;
  };
  metric: AnalysisMetric;
  view: AnalysisView;
  isPending: boolean;
}) {
  const rows = Array.isArray(result.data) ? result.data : use(result.data);
  const likes = metric === "likes";
  const valueKey = likes ? "publishedArticleLikes" : "articleCount";
  const valueLabel = likes ? "公開記事の現在のいいね数" : "記事数";
  return (
    <>
      {view === "chart" && (
        <AnalysisChartBoundary>
          <Suspense fallback={<AnalysisChartFallback metric={metric} />}>
            <LazyAnalysisChart metric={metric} rows={rows} />
          </Suspense>
        </AnalysisChartBoundary>
      )}
      <div role="status" aria-live="polite">
        {rows.length}期間
      </div>
      {rows.every((row) => row[valueKey] === 0) && (
        <p>該当するデータはありません。</p>
      )}
      <div className={analysisResultsClass} aria-busy={isPending}>
        <Table>
          <caption className="sr-only">{valueLabel}の時系列データ</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">期間開始日（UTC）</TableHead>
              <TableHead scope="col">記事数</TableHead>
              <TableHead scope="col">公開記事の現在のいいね数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.bucketStart}>
                <TableCell>{row.bucketStart}</TableCell>
                <TableCell>{row.articleCount}</TableCell>
                <TableCell>{row.publishedArticleLikes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

class AnalysisChartBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error:
        error instanceof Error
          ? error
          : new Error("グラフを表示できませんでした"),
    };
  }

  render() {
    if (this.state.error)
      return (
        <p className={analysisChartClass} role="status">
          グラフを読み込めませんでした。集計表をご利用ください。
        </p>
      );
    return this.props.children;
  }
}

function AnalysisChartFallback({ metric }: { metric: AnalysisMetric }) {
  const { label, description } = analysisChartText(metric);
  return (
    <figure aria-label={label}>
      <figcaption className="sr-only">{label}</figcaption>
      <p className="mb-2 text-sm">{description}</p>
      <div className={analysisChartClass} aria-hidden="true" />
    </figure>
  );
}

const pendingRows: Promise<AnalysisRow[]> = new Promise(() => {});

type BoundaryProps = {
  resource: AnalysisRow[] | Promise<AnalysisRow[]>;
  retry: () => void;
  children: ReactNode;
};

class AnalysisErrorBoundary extends Component<
  BoundaryProps,
  { resource: BoundaryProps["resource"]; error: Error | null }
> {
  state = { resource: this.props.resource, error: null as Error | null };

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: { resource: BoundaryProps["resource"] },
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
          : new Error("時系列データを取得できませんでした"),
    };
  }

  render() {
    if (this.state.error)
      return (
        <div role="alert">
          <p>{this.state.error.message}</p>
          <Button variant="outline" onClick={this.props.retry}>
            再試行
          </Button>
        </div>
      );
    return this.props.children;
  }
}
