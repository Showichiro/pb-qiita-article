/** @jsxImportSource react */
import {
  Component,
  Suspense,
  use,
  useCallback,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
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
  articleOrderDirections,
  articleOrderFields,
  articlesCardExtraClass,
  articlesFormClass,
  articlesIslandClass,
  articlesLinkClass,
  articlesNavClass,
  articlesResultsClass,
  articlesTagControlClass,
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
import { useDebouncedAction } from "./hooks/useDebouncedAction";

export type ArticlesAppProps = {
  initialConfig?: FindAllArticlesConfig;
  initialArticles?: Article[];
  initialDraft?: ArticleDraft;
  initialTagOptions?: string[];
};
export default function ArticlesApp({
  initialConfig,
  initialArticles,
  initialDraft,
  initialTagOptions = [],
}: ArticlesAppProps = {}) {
  const initialQuery = () =>
    (initialArticles === undefined || initialConfig === undefined) &&
    typeof window !== "undefined"
      ? parseArticleQuery(new URLSearchParams(window.location.search))
      : parseArticleQuery(configQueryParams(initialConfig ?? {}));
  const [result, setResult] = useState(() => ({
    query: initialQuery(),
    data: initialArticles ?? initialRequest(initialQuery()),
  }));
  const { query } = result;
  const [draft, setDraft] = useState(
    () => initialDraft ?? toArticleDraft(query),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const tagOptions = normalizeTags([...initialTagOptions, ...draft.tags]);
  const [isPending, startTransition] = useTransition();
  const active = useRef<{
    query: ArticleQuery;
    controller?: AbortController;
    request?: Promise<Article[]>;
  }>({ query });
  // Deduplication: track the last canonical query to avoid duplicate requests
  const lastCanonicalQuery = useRef<string | null>(
    articleQueryParams(query).toString(),
  );

  // Stable ref for latest draft to avoid stale closures in debounce callback
  const latestDraftRef = useRef<ArticleDraft>(draft);
  const isComposing = useRef(false);

  const load = useCallback(
    (
      next: ArticleQuery,
      options: { retry?: boolean } = {},
    ): Promise<Article[]> => {
      const canonical = articleQueryParams(next).toString();
      if (
        !options.retry &&
        canonical === lastCanonicalQuery.current &&
        !active.current.controller?.signal.aborted
      )
        return active.current.request ?? Promise.resolve([]);
      lastCanonicalQuery.current = canonical;

      active.current.controller?.abort();
      const controller = new AbortController();
      active.current = { query: next, controller };
      const request = fetchArticles(next, controller.signal);
      active.current.request = request;
      const data = request.catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return pendingArticles;
        if (active.current.controller === controller)
          lastCanonicalQuery.current = null;
        throw error;
      });
      void data.catch(() => {});
      startTransition(() => setResult({ query: next, data }));
      return request;
    },
    [],
  );

  const writeSearchUrl = useCallback((next: ArticleQuery) => {
      const canonical = articleQueryParams(next).toString();
      const current = articleQueryParams(
        parseArticleQuery(new URLSearchParams(window.location.search)),
      ).toString();
      if (canonical === current) return;
      const url = new URL(window.location.href);
      for (const key of Object.keys(next)) url.searchParams.delete(key);
      articleQueryParams(next).forEach((value, key) => {
        url.searchParams.append(key, value);
      });
      window.history.pushState(null, "", url);
  }, []);

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
      try {
        await awaitOrAbort(load(next), signal);
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return;
        // The resource Promise carries non-abort failures to ResultsBoundary.
      }
    },
    [load, writeSearchUrl],
  );
  const debouncedSearch = useDebouncedAction(runSearch, {
    intervalMs: 500,
    startTransition,
    isValid: isSearchDraftValid,
    areEqual: areSearchDraftsEqual,
  });
  const updateDraft = useCallback(
    (field: keyof ArticleDraft, value: string | string[]) => {
      const nextDraft = { ...latestDraftRef.current, [field]: value };
      latestDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setValidationError(null);
      return nextDraft;
    },
    [],
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
      if (
        articleQueryParams(commitArticleDraft(nextDraft)).toString() ===
          lastCanonicalQuery.current &&
        !active.current.controller?.signal.aborted
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
    [debouncedSearch.cancel, debouncedSearch.trigger, navigate],
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
  const subscribeHistory = useCallback(
    (_node: HTMLElement | null) => {
      const onPop = () => {
        debouncedSearch.cancel();
        const current = parseArticleQuery(
          new URLSearchParams(window.location.search),
        );
        const nextDraft = toArticleDraft(current);
        latestDraftRef.current = nextDraft;
        setDraft(nextDraft);
        setValidationError(null);
        void load(current);
      };
      window.addEventListener("popstate", onPop);
      const current = parseArticleQuery(
        new URLSearchParams(window.location.search),
      );
      if (
        articleQueryParams(current).toString() !==
          articleQueryParams(active.current.query).toString() ||
        active.current.controller?.signal.aborted
      )
        void load(current);
      return () => {
        window.removeEventListener("popstate", onPop);
        active.current.controller?.abort();
        debouncedSearch.cancel();
      };
    },
    [debouncedSearch.cancel, load],
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
  return (
    <section
      ref={subscribeHistory}
      className={articlesIslandClass}
      aria-label="記事検索"
    >
      <Card className={articlesCardExtraClass}>
        <form
          action="/articles"
          method="get"
          onSubmit={submit}
          className={articlesFormClass}
        >
          {(["q", "author"] as const).map((name) => (
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
                    e.nativeEvent instanceof InputEvent &&
                      e.nativeEvent.isComposing,
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
          ))}
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
          {rangeFields.map((name) => (
            <label key={name} htmlFor={articleFieldId(name)}>
              {
                {
                  minLikes: "いいね数（下限）",
                  maxLikes: "いいね数（上限）",
                  minStocks: "ストック数（下限）",
                  maxStocks: "ストック数（上限）",
                }[name]
              }
              {" "}
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
          <label htmlFor={articleFieldId("since")}>
            投稿日（開始）{" "}
            <Input
              type="date"
              id={articleFieldId("since")}
              name="since"
              value={draft.since.slice(0, 10)}
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
              value={draft.until.slice(0, 10)}
              onChange={(e) =>
                handleImmediateChange("until", e.target.value)
              }
            />
          </label>
          <label htmlFor={articleFieldId("orderField")}>
            並び替え{" "}
            <Select
              id={articleFieldId("orderField")}
              name="orderField"
              value={draft.orderField}
              onChange={(e) =>
                handleImmediateChange(
                  "orderField",
                  e.target.value as ArticleQuery["orderField"],
                )
              }
            >
              {articleOrderFields.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label htmlFor={articleFieldId("orderDirection")}>
            順序{" "}
            <Select
              id={articleFieldId("orderDirection")}
              name="orderDirection"
              value={draft.orderDirection}
              onChange={(e) =>
                handleImmediateChange(
                  "orderDirection",
                  e.target.value as ArticleQuery["orderDirection"],
                )
              }
            >
              {articleOrderDirections.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label htmlFor={articleFieldId("limit")}>
            表示件数{" "}
            <Input
              id={articleFieldId("limit")}
              name="limit"
              type="number"
              min="1"
              max="100"
              value={draft.limit}
              onChange={(e) => handleTextChange("limit", e.target.value, false)}
            />
          </label>
          <Input type="hidden" name="offset" value={draft.offset} />
          <Button type="submit">検索する</Button>
        </form>
        {validationError && (
          <p id="articles-validation" role="alert">
            {validationError}
          </p>
        )}
        <div role="status" aria-live="polite">
          {isPending ? "読み込み中…" : ""}
        </div>
        <ResultsBoundary
          resource={result.data}
          retry={() => {
            debouncedSearch.cancel();
            void load(active.current.query, { retry: true });
          }}
        >
          <Suspense fallback={<p role="status">読み込み中…</p>}>
            <ArticleResults
              result={result}
              isPending={isPending}
              navigate={navigate}
              cancelDebounce={debouncedSearch.cancel}
            />
          </Suspense>
        </ResultsBoundary>
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

function awaitOrAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

const pendingArticles: Promise<Article[]> = new Promise(() => {});
const initialRequests = new Map<string, Promise<Article[]>>();
function initialRequest(query: ArticleQuery) {
  const key = articleQueryParams(query).toString();
  let promise = initialRequests.get(key);
  if (!promise) {
    promise = fetchArticles(query, new AbortController().signal);
    initialRequests.set(key, promise);
    void promise.catch(() => initialRequests.delete(key));
    const oldest = initialRequests.keys().next().value;
    if (initialRequests.size > 20 && oldest !== undefined)
      initialRequests.delete(oldest);
  }
  return promise;
}

type ResultsProps = {
  result: { query: ArticleQuery; data: Article[] | Promise<Article[]> };
  isPending: boolean;
  navigate: (query: ArticleQuery) => void;
  cancelDebounce: () => void;
};
function ArticleResults({ result, isPending, navigate, cancelDebounce }: ResultsProps) {
  const { query, data } = result;
  const articles = Array.isArray(data) ? data : use(data);
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
                <TableCell>
                  <a
                    className={articlesLinkClass}
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://qiita.com/${encodeURIComponent(article.userId)}/items/${encodeURIComponent(article.id)}`}
                  >
                    {article.title}
                  </a>
                </TableCell>
                <TableCell>
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
                <TableCell>
                  <ul>
                    {article.tags.map((tag) => (
                      <li
                        className={articlesTagClass}
                        key={tag.name}
                      >
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
                <TableCell>{article.likesCount}</TableCell>
                <TableCell>{article.stocksCount}</TableCell>
                <TableCell>{article.createdAt.slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <nav className={articlesNavClass} aria-label="記事のページ">
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

type BoundaryProps = {
  resource: ResultsProps["result"]["data"];
  retry: () => void;
  children: ReactNode;
};
class ResultsBoundary extends Component<
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
          : new Error("記事を取得できませんでした"),
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
