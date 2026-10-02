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
  articleQueryParams,
  fetchArticles,
  parseArticleQuery,
  type ArticleQuery,
} from "./articles";

export type ArticlesAppProps = {
  initialConfig?: FindAllArticlesConfig;
  initialArticles?: Article[];
};
export default function ArticlesApp({
  initialConfig,
  initialArticles,
}: ArticlesAppProps = {}) {
  const initialQuery = () =>
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
  const [draft, setDraft] = useState(query);
  const [isPending, startTransition] = useTransition();
  const active = useRef<{ query: ArticleQuery; controller?: AbortController }>({
    query,
  });
  const load = useCallback((next: ArticleQuery) => {
    active.current.controller?.abort();
    const controller = new AbortController();
    active.current = { query: next, controller };
    // Start once in the event handler and retain the Promise across render retries.
    const data = fetchArticles(next, controller.signal);
    void data.catch(() => {});
    setDraft(next);
    startTransition(() => setResult({ query: next, data }));
  }, []);
  const navigate = (next: ArticleQuery) => {
    const url = new URL(window.location.href);
    for (const key of Object.keys(next)) url.searchParams.delete(key);
    articleQueryParams(next).forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    window.history.pushState(null, "", url);
    load(next);
  };
  // React 19 ref cleanup owns the native history subscription.
  const subscribeHistory = useCallback(() => {
    const onPop = () =>
      load(parseArticleQuery(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      active.current.controller?.abort();
    };
  }, [load]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(parseArticleQuery(articleQueryParams({ ...draft, offset: 0 })));
  };
  return (
    <section
      ref={subscribeHistory}
      className="react-island"
      aria-label="記事検索"
    >
      <Card className="gap-4 p-4">
        <form
          action="/articles"
          method="get"
          onSubmit={submit}
          className="flex flex-wrap items-end gap-3"
        >
          <label htmlFor="articles-since">
            投稿日（開始）{" "}
            <Input
              type="date"
              id="articles-since"
              name="since"
              value={draft.since.slice(0, 10)}
              onChange={(e) => setDraft({ ...draft, since: e.target.value })}
            />
          </label>
          <label htmlFor="articles-until">
            投稿日（終了）{" "}
            <Input
              type="date"
              id="articles-until"
              name="until"
              value={draft.until.slice(0, 10)}
              onChange={(e) => setDraft({ ...draft, until: e.target.value })}
            />
          </label>
          <label htmlFor="articles-orderField">
            並び替え{" "}
            <Select
              id="articles-orderField"
              name="orderField"
              value={draft.orderField}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  orderField: e.target.value as ArticleQuery["orderField"],
                })
              }
            >
              <option value="createdAt">投稿日</option>
              <option value="likesCount">いいね数</option>
              <option value="stocksCount">ストック数</option>
            </Select>
          </label>
          <label htmlFor="articles-orderDirection">
            順序{" "}
            <Select
              id="articles-orderDirection"
              name="orderDirection"
              value={draft.orderDirection}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  orderDirection: e.target
                    .value as ArticleQuery["orderDirection"],
                })
              }
            >
              <option value="desc">降順</option>
              <option value="asc">昇順</option>
            </Select>
          </label>
          <label htmlFor="articles-limit">
            表示件数{" "}
            <Input
              id="articles-limit"
              name="limit"
              type="number"
              min="1"
              max="100"
              value={draft.limit}
              onChange={(e) =>
                setDraft({ ...draft, limit: Number(e.target.value) })
              }
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
          retry={() => load(active.current.query)}
        >
          <Suspense fallback={<p role="status">読み込み中…</p>}>
            <ArticleResults
              result={result}
              isPending={isPending}
              navigate={navigate}
            />
          </Suspense>
        </ResultsBoundary>
      </Card>
    </section>
  );
}

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
};
function ArticleResults({ result, isPending, navigate }: ResultsProps) {
  const { query, data } = result;
  const articles = Array.isArray(data) ? data : use(data);
  return (
    <>
      <div role="status" aria-live="polite">
        {articles.length}件
      </div>
      {articles.length === 0 && <p>該当する記事はありません。</p>}
      <div className="overflow-x-auto" aria-busy={isPending}>
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "タイトル",
                "執筆者",
                "タグ",
                "いいね数",
                "ストック数",
                "投稿日",
              ].map((label) => (
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
                    className="underline underline-offset-4"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://qiita.com/${encodeURIComponent(article.userId)}/items/${encodeURIComponent(article.id)}`}
                  >
                    {article.title}
                  </a>
                </TableCell>
                <TableCell>
                  <a
                    className="underline underline-offset-4"
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
                        className="inline-flex rounded-full border px-2 py-0.5 text-xs"
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
      <nav className="my-4 flex items-center gap-3" aria-label="記事のページ">
        <Button
          type="button"
          variant="outline"
          disabled={isPending || query.offset === 0}
          onClick={() =>
            navigate({
              ...query,
              offset: Math.max(0, query.offset - query.limit),
            })
          }
        >
          前へ
        </Button>
        <span>{Math.floor(query.offset / query.limit) + 1}</span>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || articles.length < query.limit}
          onClick={() =>
            navigate({ ...query, offset: query.offset + query.limit })
          }
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
