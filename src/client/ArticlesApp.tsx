/** @jsxImportSource react */
import { useEffect, useRef, useState, type FormEvent } from "react";
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
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(query);
  const [articles, setArticles] = useState<Article[]>(initialArticles ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current && initialArticles !== undefined) {
      first.current = false;
      return;
    }
    first.current = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchArticles(query, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setArticles(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "記事を取得できませんでした",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, initialArticles]);
  useEffect(() => {
    const onPop = () => {
      const next = parseArticleQuery(
        new URLSearchParams(window.location.search),
      );
      setQuery(next);
      setDraft(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (next: ArticleQuery) => {
    const url = new URL(window.location.href);
    for (const key of Object.keys(next)) url.searchParams.delete(key);
    articleQueryParams(next).forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    window.history.pushState(null, "", url);
    setQuery(next);
    setDraft(next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(parseArticleQuery(articleQueryParams({ ...draft, offset: 0 })));
  };
  return (
    <section className="react-island" aria-label="記事検索">
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
        <div aria-live="polite" role="status">
          {loading ? "読み込み中…" : error ? "" : `${articles.length}件`}
        </div>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuery((current) => ({ ...current }))}
            >
              再試行
            </Button>
          </div>
        )}
        {!loading && !error && articles.length === 0 && (
          <p>該当する記事はありません。</p>
        )}
        <div className="overflow-x-auto" aria-busy={loading}>
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
            disabled={loading || query.offset === 0}
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
            disabled={loading || !!error || articles.length < query.limit}
            onClick={() =>
              navigate({ ...query, offset: query.offset + query.limit })
            }
          >
            次へ
          </Button>
        </nav>
      </Card>
    </section>
  );
}
