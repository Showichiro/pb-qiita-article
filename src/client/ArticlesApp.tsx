/** @jsxImportSource react */
import { japanDate } from "@/util/japanTime";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Article } from "@/schemas";
import {
  Button,
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui";
import type { FindAllArticlesConfig } from "@/db";
import {
  articleColumnLabels,
  articlesCardExtraClass,
  articlesIslandClass,
  articlesLinkClass,
  articlesNavClass,
  articlesResultsClass,
  articlesTagClass,
} from "./articles-presentation";
import {
  articleQueryParams,
  fetchArticles,
  type ArticleQuery,
  type ArticleDraft,
} from "./articles";
import { useArticlesSearch } from "./useArticlesSearch";
import {
  ArticlesSearchForm,
  ArticlesPageSizeControl,
} from "./ArticlesSearchForm";
import { DataVersionControls } from "./data-version-controls";

export type ArticlesAppProps = {
  initialConfig?: FindAllArticlesConfig;
  initialArticles: Article[];
  initialDataVersion: string;
  initialDraft?: ArticleDraft;
  initialTagOptions?: string[];
};

export default function ArticlesApp({
  initialConfig,
  initialDataVersion,
  initialDraft,
  initialTagOptions = [],
}: ArticlesAppProps) {
  const {
    requestQuery,
    articles,
    adoptedVersion,
    versionState,
    isFetching,
    isPending,
    refreshData,
    requestFailure,
    retryFailedQuery,
    navigate,
    cancelDebounce,
    form,
  } = useArticlesSearch({
    initialConfig,
    initialDataVersion,
    initialDraft,
    initialTagOptions,
  });
  return (
    <section className={articlesIslandClass} aria-label="記事検索">
      <Card className={articlesCardExtraClass}>
        <ArticlesSearchForm {...form} />
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
          {isFetching > 0 || isPending ? "読み込み中…" : ""}
        </div>
        <ArticleResults
          key={`${adoptedVersion}:${articleQueryParams(requestQuery)}`}
          version={adoptedVersion}
          result={{ query: requestQuery, data: articles }}
          isPending={isPending || isFetching > 0}
          navigate={navigate}
          cancelDebounce={cancelDebounce}
        />{" "}
        <ArticlesPageSizeControl
          draft={form.draft}
          handleTextChange={form.handleTextChange}
        />
      </Card>
    </section>
  );
}

type ResultsProps = {
  version: string;
  result: { query: ArticleQuery; data: Article[] };
  isPending: boolean;
  navigate: (query: ArticleQuery) => void;
  cancelDebounce: () => void;
};
function ArticleResults({
  version,
  result,
  isPending,
  navigate,
  cancelDebounce,
}: ResultsProps) {
  const { query, data } = result;
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    () => false,
  );
  const feed = useInfiniteQuery({
    queryKey: ["articles", version, query, "feed"],
    initialPageParam: query.offset,
    initialData: { pages: [data], pageParams: [query.offset] },
    queryFn: ({ pageParam, signal }) =>
      fetchArticles({ ...query, offset: pageParam }, version, signal),
    getNextPageParam: (last, _pages, offset) =>
      last.length === query.limit ? offset + query.limit : undefined,
    enabled: mobile,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const articles = mobile
    ? [
        ...new Map(
          feed.data.pages.flat().map((article) => [article.id, article]),
        ).values(),
      ]
    : data;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !mobile ||
      isPending ||
      feed.isFetching ||
      feed.isError ||
      !feed.hasNextPage ||
      !sentinel.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void feed.fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [
    mobile,
    isPending,
    feed.isFetching,
    feed.isError,
    feed.hasNextPage,
    feed.fetchNextPage,
  ]);
  return (
    <>
      <div role="status" aria-live="polite">
        {articles.length}件
      </div>
      {articles.length === 0 && <p>該当する記事はありません。</p>}
      <div className={articlesResultsClass} aria-busy={isPending}>
        <Table>
          <TableHeader>
            <TableRow>
              {articleColumnLabels.map((label) => (
                <TableHead key={label} scope="col">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {articles.map((article) => (
              <TableRow key={article.id}>
                <TableCell data-label={articleColumnLabels[0]}>
                  <a
                    className={articlesLinkClass}
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://qiita.com/${encodeURIComponent(article.userId)}/items/${encodeURIComponent(article.id)}`}
                  >
                    {article.title}
                  </a>
                </TableCell>
                <TableCell data-label={articleColumnLabels[1]}>
                  <a
                    className={articlesLinkClass}
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://qiita.com/${encodeURIComponent(article.userId)}`}
                  >
                    {article.userId}
                    {article.userName && `(${article.userName})`}
                  </a>
                </TableCell>
                <TableCell data-label={articleColumnLabels[2]}>
                  <ul>
                    {article.tags.map((tag) => (
                      <li className={articlesTagClass} key={tag.name}>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`https://qiita.com/tags/${encodeURIComponent(tag.name)}`}
                        >
                          {tag.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </TableCell>
                <TableCell data-label={articleColumnLabels[3]}>
                  {article.likesCount}
                </TableCell>
                <TableCell data-label={articleColumnLabels[4]}>
                  {article.stocksCount}
                </TableCell>
                <TableCell data-label={articleColumnLabels[5]}>
                  {article.createdAt ? japanDate(article.createdAt) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {mobile && (
        <div className="mobile-feed" ref={sentinel}>
          <p role="status" aria-live="polite">
            {feed.isFetching
              ? "読み込み中…"
              : !feed.hasNextPage
                ? "すべての記事を表示しました"
                : ""}
          </p>
          {feed.isError && (
            <p role="alert">続きの記事を取得できませんでした。</p>
          )}
          {feed.hasNextPage && (
            <Button
              variant="outline"
              disabled={isPending || feed.isFetching}
              onClick={() => void feed.fetchNextPage()}
            >
              {feed.isError ? "再試行" : "もっと見る"}
            </Button>
          )}
        </div>
      )}
      <nav
        className={mobile ? "hidden" : articlesNavClass}
        aria-label="記事のページ"
      >
        <Button
          type="button"
          variant="outline"
          disabled={isPending || query.offset === 0}
          onClick={() => {
            cancelDebounce();
            navigate({
              ...query,
              offset: Math.max(0, query.offset - query.limit),
            });
          }}
        >
          前へ
        </Button>
        <span>{Math.floor(query.offset / query.limit) + 1}</span>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || articles.length < query.limit}
          onClick={() => {
            cancelDebounce();
            navigate({ ...query, offset: query.offset + query.limit });
          }}
        >
          次へ
        </Button>
      </nav>
    </>
  );
}

function mobileSnapshot() {
  return window.matchMedia?.("(max-width: 639px)").matches ?? false;
}
function subscribeMobile(callback: () => void) {
  const media = window.matchMedia?.("(max-width: 639px)");
  media?.addEventListener("change", callback);
  return () => media?.removeEventListener("change", callback);
}
