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
  articlesTagClass,
} from "./articles-presentation";
import {
  articleQueryParams,
  fetchArticles,
  parseArticleQuery,
  type ArticleQuery,
  type ArticleDraft,
  toArticleDraft,
} from "./articles";
import { useDebouncedAction } from "./hooks/useDebouncedAction";

export type ArticlesAppProps = {
  initialConfig?: FindAllArticlesConfig;
  initialArticles?: Article[];
  initialDraft?: ArticleDraft;
};
export default function ArticlesApp({
  initialConfig,
  initialArticles,
  initialDraft,
}: ArticlesAppProps = {}) {
  const initialQuery = () =>
    (initialArticles === undefined || initialConfig === undefined) &&
    typeof window !== "undefined"
      ? parseArticleQuery(new URLSearchParams(window.location.search))
      : parseArticleQuery(
          new URLSearchParams(
            Object.entries(initialConfig ?? {})
              .filter(([, value]) => value != null)
              .map(([key, value]) => [key, String(value)]),
          ),
        );
  const [result, setResult] = useState(() => ({
    query: initialQuery(),
    data: initialArticles ?? initialRequest(initialQuery()),
  }));
  const { query } = result;
  const [draft, setDraft] = useState(
    () => initialDraft ?? toArticleDraft(query),
  );
  const [isPending, startTransition] = useTransition();
  const active = useRef<{ query: ArticleQuery; controller?: AbortController }>({
    query,
  });

  // Deduplication: track the last canonical query to avoid duplicate requests
  const lastCanonicalQuery = useRef<string | null>(
    articleQueryParams(query).toString(),
  );

  // Stable ref for latest draft to avoid stale closures in debounce callback
  const latestDraftRef = useRef<ArticleDraft>(draft);

  const load = useCallback(
    (next: ArticleQuery, skipDedupe = false) => {
      const canonical = articleQueryParams(next).toString();
      if (
        !skipDedupe &&
        canonical === lastCanonicalQuery.current &&
        !active.current.controller?.signal.aborted
      ) {
        return;
      }
      lastCanonicalQuery.current = canonical;

      active.current.controller?.abort();
      const controller = new AbortController();
      active.current = { query: next, controller };
      const data = fetchArticles(next, controller.signal).catch((error) => {
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
      setDraft(toArticleDraft(next));
      startTransition(() => setResult({ query: next, data }));
    },
    [],
  );

  const navigate = useCallback(
    (next: ArticleQuery) => {
      load(next);
      const canonical = articleQueryParams(next).toString();
      const current = articleQueryParams(
        parseArticleQuery(new URLSearchParams(window.location.search)),
      ).toString();
      if (canonical === current) return;
      const url = new URL(window.location.href);
      for (const key of Object.keys(next)) url.searchParams.delete(key);
      articleQueryParams(next).forEach((value, key) => {
        url.searchParams.set(key, value);
      });
      window.history.pushState(null, "", url);
    },
    [load],
  );

  // Debounced action for limit field (500ms delay)
  const limitDebounce = useDebouncedAction(
    async (limitValue: string, _signal: AbortSignal) => {
      const limitNum = Number(limitValue);
      if (!Number.isSafeInteger(limitNum) || limitNum < 1 || limitNum > 100) {
        // Invalid limit: don't fetch, keep raw draft
        return;
      }
      // Build query from latest draft (not committed query)
      const latestDraft = latestDraftRef.current;
      const limitNumDraft = Number(latestDraft.limit);
      const isLimitValid =
        Number.isSafeInteger(limitNumDraft) && limitNumDraft >= 1 && limitNumDraft <= 100;

      if (!isLimitValid) {
        return;
      }

      // Reset offset when limit changes
      const next: ArticleQuery = {
        since: latestDraft.since,
        until: latestDraft.until,
        orderField: latestDraft.orderField,
        orderDirection: latestDraft.orderDirection,
        limit: limitNum,
        offset: 0,
      };
      navigate(next);
    },
    {
      intervalMs: 500,
      startTransition,
      isValid: (val: string) => {
        const num = Number(val);
        return Number.isSafeInteger(num) && num >= 1 && num <= 100;
      },
      areEqual: (a: string, b: string) => a === b,
    },
  );

  // Immediate fetch for date/select changes (no debounce)
  const handleFilterChange = useCallback(
    (field: keyof ArticleDraft, value: string) => {
      const newDraft = { ...draft, [field]: value };
      setDraft(newDraft);
      latestDraftRef.current = newDraft;

      // Cancel any pending debounce timer
      limitDebounce.cancel();

      // Validate full draft before fetching
      const limitNum = Number(newDraft.limit);
      const isLimitValid =
        Number.isSafeInteger(limitNum) && limitNum >= 1 && limitNum <= 100;

      if (!isLimitValid) {
        // Invalid limit: don't fetch, keep raw draft
        return;
      }

      // Build query from draft (not committed query)
      const next: ArticleQuery = {
        since: newDraft.since,
        until: newDraft.until,
        orderField: newDraft.orderField,
        orderDirection: newDraft.orderDirection,
        limit: limitNum,
        offset: 0,
      };
      navigate(next);
    },
    [draft, navigate, limitDebounce.cancel],
  );

  // React 19 ref cleanup owns the native history subscription.
  const subscribeHistory = useCallback(
    (_node: HTMLElement | null) => {
      const onPop = () => {
        // Cancel any pending debounce on history navigation
        limitDebounce.cancel();
        const current = parseArticleQuery(new URLSearchParams(window.location.search));
        setDraft(toArticleDraft(current));
        latestDraftRef.current = toArticleDraft(current);
        load(current);
      };
      window.addEventListener("popstate", onPop);
      // Bootstrap rows belong to their server query. Catch history changes before
      // subscription, including changes between the first render and commit.
      const current = parseArticleQuery(
        new URLSearchParams(window.location.search),
      );
      if (
        articleQueryParams(current).toString() !==
          articleQueryParams(active.current.query).toString() ||
        active.current.controller?.signal.aborted
      )
        load(current);
      return () => {
        window.removeEventListener("popstate", onPop);
        active.current.controller?.abort();
        limitDebounce.cancel();
      };
    },
    [load, limitDebounce.cancel],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Cancel any pending debounce before submit
    limitDebounce.cancel();
    navigate(
      parseArticleQuery(
        articleQueryParams({ ...draft, limit: Number(draft.limit), offset: 0 }),
      ),
    );
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
          <label htmlFor={articleFieldId("since")}>
            投稿日（開始）{" "}
            <Input
              type="date"
              id={articleFieldId("since")}
              name="since"
              value={draft.since.slice(0, 10)}
              onChange={(e) => handleFilterChange("since", e.target.value)}
            />
          </label>
          <label htmlFor={articleFieldId("until")}>
            投稿日（終了）{" "}
            <Input
              type="date"
              id={articleFieldId("until")}
              name="until"
              value={draft.until.slice(0, 10)}
              onChange={(e) => handleFilterChange("until", e.target.value)}
            />
          </label>
          <label htmlFor={articleFieldId("orderField")}>
            並び替え{" "}
            <Select
              id={articleFieldId("orderField")}
              name="orderField"
              value={draft.orderField}
              onChange={(e) =>
                handleFilterChange(
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
                handleFilterChange(
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
              onChange={(e) => {
                const newDraft = { ...draft, limit: e.target.value };
                setDraft(newDraft);
                latestDraftRef.current = newDraft;
                limitDebounce.trigger(e.target.value);
              }}
            />
          </label>
          <Input type="hidden" name="offset" value={draft.offset} />
          <Button type="submit">検索する</Button>
        </form>
        <div role="status" aria-live="polite">
          {isPending ? "読み込み中…" : ""}
        </div>
        <ResultsBoundary
          resource={result.data}
          retry={() => {
            limitDebounce.cancel();
            load(active.current.query, true); // skip dedupe to allow retry
          }}
        >
          <Suspense fallback={<p role="status">読み込み中…</p>}>
            <ArticleResults
              result={result}
              isPending={isPending}
              navigate={navigate}
              cancelDebounce={limitDebounce.cancel}
            />
          </Suspense>
        </ResultsBoundary>
      </Card>
    </section>
  );
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
