/** @jsxImportSource react */
import { Component, Suspense, lazy, type ReactNode } from "react";
import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui";
import type {
  AnalysisBootstrap,
  AnalysisDraft,
  AnalysisMetric,
  AnalysisQuery,
  AnalysisRow,
  AnalysisView,
} from "./analysis";
import { useAnalysisSearch } from "./useAnalysisSearch";
import { AnalysisSearchForm } from "./AnalysisSearchForm";
import { DataVersionControls } from "./data-version-controls";
import {
  analysisCardClass,
  analysisChartClass,
  analysisChartText,
  analysisIslandClass,
  analysisNoteClass,
  analysisResultsClass,
} from "./analysis-presentation";

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
  const {
    requestQuery,
    rows,
    metric,
    view,
    versionState,
    isFetching,
    isPending,
    refreshData,
    requestFailure,
    retryFailedQuery,
    form,
  } = useAnalysisSearch({
    initialData,
    initialDraft,
    initialMetric,
    initialView,
  });
  return (
    <section className={analysisIslandClass} aria-label="時系列分析">
      <Card className={analysisCardClass}>
        <AnalysisSearchForm {...form} />
        <p className={analysisNoteClass}>
          いいね数は各期間に公開された記事の現在値であり、その期間中に獲得した数ではありません。
        </p>
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
        {(isPending || isFetching > 0) && (
          <div role="status" aria-live="polite">
            読み込み中…
          </div>
        )}
        <AnalysisResults
          result={{ query: requestQuery, data: rows }}
          metric={metric}
          view={view}
          isPending={isPending || isFetching > 0}
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
}: {
  result: {
    query: AnalysisQuery;
    data: AnalysisRow[];
  };
  metric: AnalysisMetric;
  view: AnalysisView;
  isPending: boolean;
}) {
  return (
    <ResolvedAnalysis
      result={result}
      metric={metric}
      view={view}
      isPending={isPending}
    />
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
    data: AnalysisRow[];
  };
  metric: AnalysisMetric;
  view: AnalysisView;
  isPending: boolean;
}) {
  const rows = result.data;
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
              <TableHead scope="col">期間開始日</TableHead>
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
      {description && <p className="mb-2 text-sm">{description}</p>}
      <div className={analysisChartClass} aria-hidden="true" />
    </figure>
  );
}
