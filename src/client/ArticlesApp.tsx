/** @jsxImportSource react */
import { japanDate } from "@/util/japanTime";
import { PeriodShortcuts } from "./PeriodShortcuts";
import { ActiveFilters } from "./active-filters";
import {
  articleFilters,
  parseArticleSort,
  articleSortOptions,
} from "./filter-state";
import { FilterSheet } from "./filter-sheet";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  useSyncExternalStore,
} from "react";
import {
  useIsFetching,
  useInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { Article } from "@/schemas";
import {
  Button,
  Input,
  Select,
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
  articleFieldId,
  articlesCardExtraClass,
  articlesActionFocusId,
  articlesIslandClass,
  articlesLinkClass,
  articlesNavClass,
  articlesResultsClass,
  articlesTagControlClass,
  articlesTagClearClass,
  articlesTagClearFocusId,
  articlesTagFieldClass,
  articlesTagLabelClass,
  articlesTagClass,
} from "./articles-presentation";
import {
  articleQueryParams,
  fetchArticles,
  parseArticleQuery,
  type ArticleQuery,
  type ArticleDraft,
  toArticleDraft,
  configQueryParams,
  commitArticleDraft,
  normalizeTags,
  rangeFields,
  validateArticleDraft,
} from "./articles";
import { DataVersionControls } from "./data-version-controls";
import {
  queryTask,
  useRequestIntent,
  useVersionedQuery,
} from "./hooks/useVersionedQuery";
import { articleSearchParsers } from "./search-params";
import { useSearchParams } from "./hooks/useSearchParams";
import { articlesQueryOptions, normalizeArticleQuery } from "./queries";
import { isDataQuery, useRemovePreviousGeneration } from "./query-client";
import { useDebouncedAction } from "./hooks/useDebouncedAction";

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
  const [query, setQuery] = useState(() =>
    initialConfig === undefined && typeof window !== "undefined"
      ? parseArticleQuery(new URLSearchParams(window.location.search))
      : parseArticleQuery(configQueryParams(initialConfig ?? {})),
  );
  const requestIntent = useRequestIntent();
  const [isPending, startTransition] = useTransition();
  const commitQuery = useCallback(
    (next: ArticleQuery, intent: number) => {
      startTransition(() =>
        setQuery((current) =>
          requestIntent.current === intent ? next : current,
        ),
      );
    },
    [requestIntent],
  );
  const { versionState, load, requestFailure, retryFailedQuery, refresh } =
    useVersionedQuery({
      initialVersion: initialDataVersion,
      requestIntent,
      normalize: normalizeArticleQuery,
      tasks: articleTasks,
      commit: commitQuery,
      errorMessage: "記事を取得できませんでした",
    });
  const { adoptedVersion } = versionState;
  const queryResult = useSuspenseQuery(
    articlesQueryOptions(adoptedVersion, query),
  );
  const requestQuery = queryResult.data.query;
  const articles = queryResult.data.rows;
  const isFetching = useIsFetching({
    predicate: (activeQuery) =>
      isDataQuery(activeQuery) && activeQuery.queryKey[0] === "articles",
  });
  useRemovePreviousGeneration(adoptedVersion);
  const [draft, setDraft] = useState(
    () => initialDraft ?? toArticleDraft(query),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const tagOptions = normalizeTags([...initialTagOptions, ...draft.tags]);
  const clearTagsQuery = isSearchDraftValid(draft)
    ? commitArticleDraft(draft)
    : query;
  const clearTagsHref = `/articles?${articleQueryParams({
    ...clearTagsQuery,
    tags: [],
    offset: 0,
  })}`;

  // Stable ref for latest draft to avoid stale closures in debounce callback
  const latestDraftRef = useRef<ArticleDraft>(draft);
  const isComposing = useRef(false);

  const { params: urlParams, write } = useSearchParams(
    articleSearchParsers,
    (params, initial) => {
      let current: ArticleQuery;
      try {
        current = parseArticleQuery(params);
      } catch (error) {
        requestIntent.current++;
        if (!initial) debouncedSearch.cancel();
        setValidationError(
          error instanceof Error
            ? error.message
            : "検索条件を確認してください。",
        );
        return;
      }
      if (initial) {
        if (
          articleQueryParams(current).toString() !==
          articleQueryParams(query).toString()
        )
          void load(current);
        return;
      }
      debouncedSearch.cancel();
      const nextDraft = toArticleDraft(current);
      latestDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setValidationError(null);
      void load(current);
    },
  );
  const writeSearchUrl = useCallback(
    (next: ArticleQuery) => {
      void write(articleQueryParams(next));
    },
    [write],
  );

  const runSearch = useCallback(
    async (_scheduledDraft: ArticleDraft, signal: AbortSignal) => {
      if (signal.aborted) return;
      const currentDraft = latestDraftRef.current;
      if (!isSearchDraftValid(currentDraft)) return;
      const next = commitArticleDraft(currentDraft);
      const searchDraft = { ...currentDraft, offset: 0 };
      latestDraftRef.current = searchDraft;
      setDraft(searchDraft);
      setValidationError(null);
      writeSearchUrl(next);
      await load(next);
    },
    [load, writeSearchUrl],
  );
  const debouncedSearch = useDebouncedAction(runSearch, {
    intervalMs: 500,
    startTransition,
    isValid: isSearchDraftValid,
    areEqual: areSearchDraftsEqual,
  });
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch.cancel]);

  const updateDraft = useCallback(
    (field: keyof ArticleDraft, value: string | string[]) => {
      requestIntent.current++;
      const nextDraft = { ...latestDraftRef.current, [field]: value };
      latestDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setValidationError(null);
      return nextDraft;
    },
    [requestIntent],
  );
  const navigate = useCallback(
    (next: ArticleQuery) => {
      debouncedSearch.cancel();
      const nextDraft = toArticleDraft(next);
      latestDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setValidationError(null);
      writeSearchUrl(next);
      void load(next);
    },
    [debouncedSearch.cancel, load, writeSearchUrl],
  );
  const scheduleSearch = useCallback(
    (nextDraft: ArticleDraft, immediate: boolean) => {
      if (!isSearchDraftValid(nextDraft)) {
        debouncedSearch.cancel();
        return;
      }
      let currentUrlQuery: ArticleQuery | null = null;
      try {
        currentUrlQuery = parseArticleQuery(urlParams);
      } catch {
        // A valid edit can replace a malformed history URL.
      }
      if (
        articleQueryParams(commitArticleDraft(nextDraft)).toString() ===
          articleQueryParams(query).toString() &&
        currentUrlQuery !== null &&
        articleQueryParams(commitArticleDraft(nextDraft)).toString() ===
          articleQueryParams(currentUrlQuery).toString() &&
        !requestFailure
      ) {
        debouncedSearch.cancel();
        return;
      }
      if (immediate) {
        navigate(commitArticleDraft(nextDraft));
        return;
      }
      debouncedSearch.trigger(nextDraft);
    },
    [
      debouncedSearch.cancel,
      debouncedSearch.trigger,
      navigate,
      query,
      requestFailure,
      urlParams,
    ],
  );
  const handleTextChange = useCallback(
    (
      field: "q" | "author" | "limit" | (typeof rangeFields)[number],
      value: string,
      composing: boolean,
    ) => {
      const nextDraft = updateDraft(field, value);
      if (composing || isComposing.current) debouncedSearch.cancel();
      else scheduleSearch(nextDraft, false);
    },
    [debouncedSearch.cancel, scheduleSearch, updateDraft],
  );
  const handleImmediateChange = useCallback(
    (
      field: "since" | "until" | "orderField" | "orderDirection" | "tags",
      value: string | string[],
    ) => {
      scheduleSearch(updateDraft(field, value), true);
    },
    [scheduleSearch, updateDraft],
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentDraft = { ...latestDraftRef.current };
    if (!currentDraft.limit.trim()) {
      currentDraft.limit = "10";
      latestDraftRef.current = currentDraft;
      setDraft(currentDraft);
    }
    if (!isSearchDraftValid(currentDraft)) {
      setValidationError(searchDraftError(currentDraft));
      debouncedSearch.cancel();
      return;
    }
    navigate(commitArticleDraft(currentDraft));
  };
  const refreshData = () =>
    refresh(
      () => ({ ...query, offset: 0 }),
      (next, version, intent) => {
        const nextDraft = toArticleDraft(next);
        latestDraftRef.current = nextDraft;
        setValidationError(null);
        writeSearchUrl(next);
        startTransition(() => {
          versionState.setAdoptedVersion((current) =>
            requestIntent.current === intent ? version : current,
          );
          setQuery((current) =>
            requestIntent.current === intent ? next : current,
          );
          setDraft((current) =>
            requestIntent.current === intent ? nextDraft : current,
          );
        });
      },
    );
  const renderTextField = (name: "q" | "author") => (
    <label key={name} htmlFor={articleFieldId(name)}>
      {name === "q" ? "キーワード（タイトル）" : "投稿者（ID・名前）"}{" "}
      <Input
        id={articleFieldId(name)}
        name={name}
        maxLength={200}
        value={draft[name]}
        onChange={(e) =>
          handleTextChange(
            name,
            e.target.value,
            e.nativeEvent instanceof InputEvent && e.nativeEvent.isComposing,
          )
        }
        onCompositionStart={() => {
          isComposing.current = true;
          debouncedSearch.cancel();
        }}
        onCompositionEnd={(e) => {
          isComposing.current = false;
          handleTextChange(name, e.currentTarget.value, false);
        }}
      />
    </label>
  );
  const changeFilters = (patch: Record<string, string | string[]>) => {
    const next = { ...latestDraftRef.current, ...patch };
    latestDraftRef.current = next;
    setDraft(next);
    scheduleSearch(next, true);
  };
  return (
    <section className={articlesIslandClass} aria-label="記事検索">
      <Card className={articlesCardExtraClass}>
        <PeriodShortcuts
          range={draft}
          onChange={(range) => {
            requestIntent.current++;
            const next = { ...latestDraftRef.current, ...range };
            latestDraftRef.current = next;
            setDraft(next);
            scheduleSearch(next, true);
          }}
        />
        <form
          data-focus-id={articlesActionFocusId}
          tabIndex={-1}
          id="articles-filters-form"
          action="/articles"
          method="get"
          noValidate
          onSubmit={submit}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.nativeEvent.isComposing ||
              isComposing.current ||
              !(event.target instanceof HTMLInputElement)
            )
              return;
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }}
          className="query-form"
        >
          <Input type="hidden" name="orderField" value={draft.orderField} />
          <Input
            type="hidden"
            name="orderDirection"
            value={draft.orderDirection}
          />
          <FilterSheet
            id="articles-filters"
            search={renderTextField("q")}
            controls={
              <label className="sort-control" htmlFor={articleFieldId("sort")}>
                <span className="control-label">並び順</span>
                <Select
                  id={articleFieldId("sort")}
                  name="sort"
                  value={`${draft.orderField}:${draft.orderDirection}`}
                  onChange={(event) => {
                    const sort = parseArticleSort(event.currentTarget.value);
                    if (!sort) return;
                    const next = { ...latestDraftRef.current, ...sort };
                    latestDraftRef.current = next;
                    setDraft(next);
                    scheduleSearch(next, true);
                  }}
                >
                  {articleSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            }
            count={
              articleFilters(query).filter((filter) => filter.key !== "q")
                .length
            }
          >
            <fieldset className="filter-field-group">
              <legend>投稿者・タグ</legend>
              {renderTextField("author")}{" "}
              <div
                className={articlesTagFieldClass}
                data-slot="article-tags-field"
              >
                <label
                  className={articlesTagLabelClass}
                  htmlFor={articleFieldId("tags")}
                >
                  タグ（すべて一致）{" "}
                  <Select
                    id={articleFieldId("tags")}
                    name="tags"
                    multiple
                    size={4}
                    className={articlesTagControlClass}
                    wrapperClassName={articlesTagControlClass}
                    value={draft.tags}
                    onChange={(e) =>
                      handleImmediateChange(
                        "tags",
                        Array.from(
                          e.target.selectedOptions,
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
                  className={articlesTagClearClass}
                  data-focus-id={articlesTagClearFocusId}
                  onClick={(event) => {
                    event.preventDefault();
                    handleImmediateChange("tags", []);
                  }}
                >
                  タグを解除
                </a>
              </div>
            </fieldset>
            <fieldset className="filter-field-group">
              <legend>いいね・ストック数</legend>{" "}
              {rangeFields.map((name) => (
                <label key={name} htmlFor={articleFieldId(name)}>
                  {
                    {
                      minLikes: "いいね数（下限）",
                      maxLikes: "いいね数（上限）",
                      minStocks: "ストック数（下限）",
                      maxStocks: "ストック数（上限）",
                    }[name]
                  }{" "}
                  <Input
                    id={articleFieldId(name)}
                    name={name}
                    type="number"
                    min="0"
                    max={Number.MAX_SAFE_INTEGER}
                    step="1"
                    aria-describedby={
                      validationError ? "articles-validation" : undefined
                    }
                    value={draft[name]}
                    onChange={(e) =>
                      handleTextChange(name, e.target.value, false)
                    }
                  />
                </label>
              ))}
            </fieldset>
            <fieldset className="filter-field-group">
              <legend>投稿期間</legend>{" "}
              <label htmlFor={articleFieldId("since")}>
                投稿日（開始）{" "}
                <Input
                  type="date"
                  id={articleFieldId("since")}
                  name="since"
                  value={draft.since ? japanDate(draft.since) : ""}
                  onChange={(e) =>
                    handleImmediateChange("since", e.target.value)
                  }
                />
              </label>
              <label htmlFor={articleFieldId("until")}>
                投稿日（終了）{" "}
                <Input
                  type="date"
                  id={articleFieldId("until")}
                  name="until"
                  value={draft.until ? japanDate(draft.until) : ""}
                  onChange={(e) =>
                    handleImmediateChange("until", e.target.value)
                  }
                />
              </label>
            </fieldset>

            {validationError && (
              <p id="articles-validation" role="alert">
                {validationError}
              </p>
            )}
          </FilterSheet>
          <ActiveFilters
            filters={articleFilters(query)}
            onRemove={(filter) => changeFilters(filter.clear)}
            onClear={() =>
              changeFilters({
                q: "",
                author: "",
                tags: [],
                minLikes: "",
                maxLikes: "",
                minStocks: "",
                maxStocks: "",
                since: "",
                until: "",
              })
            }
          />{" "}
          <Input type="hidden" name="offset" value={draft.offset} />
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
          {isFetching > 0 || isPending ? "読み込み中…" : ""}
        </div>
        <ArticleResults
          key={`${adoptedVersion}:${articleQueryParams(requestQuery)}`}
          version={adoptedVersion}
          result={{ query: requestQuery, data: articles }}
          isPending={isPending || isFetching > 0}
          navigate={navigate}
          cancelDebounce={debouncedSearch.cancel}
        />{" "}
        <label className="page-size-control" htmlFor={articleFieldId("limit")}>
          1ページの件数{" "}
          <Input
            id={articleFieldId("limit")}
            name="limit"
            form="articles-filters-form"
            type="number"
            min="1"
            max="100"
            value={draft.limit}
            onChange={(e) => handleTextChange("limit", e.target.value, false)}
          />
        </label>
      </Card>
    </section>
  );
}

function searchDraftError(draft: ArticleDraft): string | null {
  const filterError = validateArticleDraft(draft);
  if (filterError) return filterError;
  const limit = Number(draft.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    return "表示件数は1から100までの整数で入力してください。";
  if (
    (draft.since && !Number.isFinite(Date.parse(draft.since))) ||
    (draft.until && !Number.isFinite(Date.parse(draft.until)))
  )
    return "投稿日を確認してください。";
  return null;
}

function isSearchDraftValid(draft: ArticleDraft): boolean {
  return searchDraftError(draft) === null;
}

function areSearchDraftsEqual(a: ArticleDraft, b: ArticleDraft): boolean {
  const key = (value: ArticleDraft) =>
    isSearchDraftValid(value)
      ? `valid:${articleQueryParams(commitArticleDraft(value)).toString()}`
      : `invalid:${JSON.stringify(value)}`;
  return key(a) === key(b);
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

function articleTasks(version: string, query: ArticleQuery) {
  return [queryTask(articlesQueryOptions(version, query))];
}
