/** @jsxImportSource react */
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui";
import {
  rankingChartFrameClass,
  rankingIslandClass,
  rankingCardExtraClass,
  rankingLinkClass,
  rankingResultsClass,
} from "./ranking-presentation";
import {
  likesCountForChart,
  type RankingDraft,
  type RankingQuery,
  type RankingRequestQuery,
} from "./ranking";
import { useRankingSearch } from "./useRankingSearch";
import { RankingSearchForm } from "./RankingSearchForm";
import { DataVersionControls } from "./data-version-controls";

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
  const {
    query,
    result,
    versionState,
    isFetching,
    isPending,
    refreshData,
    requestFailure,
    retryFailedQuery,
    form,
  } = useRankingSearch({ initialConfig, initialDataVersion, initialDraft });
  return (
    <section className={rankingIslandClass} aria-label="ランキング検索">
      <Card className={rankingCardExtraClass}>
        <RankingSearchForm {...form} />
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

function describePeriod(query: RankingRequestQuery): string {
  if (!query.since && !query.until) return "全期間";
  return `${query.since || "指定なし"} から ${query.until || "指定なし"}`;
}
