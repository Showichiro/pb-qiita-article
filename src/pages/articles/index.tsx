import { ArticlesTable, Header, PageLayout, PageTitle } from "@/components";
import {
  findAllArticles,
  findArticleTags,
  type FindAllArticlesConfig,
  type schema,
} from "@/db";
import type { DrizzleD1Database } from "@/lib";
import {
  parseArticleQuery,
  configQueryParams,
  normalizeTags,
  rangeFields,
  articleQueryParams,
  serializeArticleBootstrap,
} from "@/client/articles";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";

export const ArticlesPage: FC<{
  db: DrizzleD1Database<typeof schema>;
  config: FindAllArticlesConfig;
}> = async ({ config, db }) => {
  const query = parseArticleQuery(configQueryParams(config));
  const articles = await findAllArticles(db, {
    ...query,
    since: query.since || null,
    until: query.until || null,
  });
  const tagOptions = normalizeTags([
    ...(await findArticleTags(db)),
    ...query.tags,
  ]);
  const pageUrl = (offset: number) =>
    `/articles?${articleQueryParams({ ...query, offset })}`;
  return (
    <>
      <Header />
      <PageTitle label="記事一覧" />
      <PageLayout>
        <div id="articles-app">
          <form
            action="/articles"
            method="get"
            class="flex flex-wrap items-end gap-3"
          >
            <label>
              キーワード（タイトル）{" "}
              <input name="q" maxLength={200} value={query.q} />
            </label>
            <label>
              投稿者（ID・名前）{" "}
              <input name="author" maxLength={200} value={query.author} />
            </label>
            <label class="block w-full min-w-0 max-w-full sm:w-64">
              タグ（すべて一致）
              <select
                class="block w-full min-w-0 max-w-full"
                name="tags"
                multiple
                size={4}
              >
                {tagOptions.map((tag) => (
                  <option
                    key={tag}
                    value={tag}
                    selected={query.tags.includes(tag)}
                  >
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            {rangeFields.map((name) => (
              <label key={name}>
                {
                  {
                    minLikes: "いいね数（下限）",
                    maxLikes: "いいね数（上限）",
                    minStocks: "ストック数（下限）",
                    maxStocks: "ストック数（上限）",
                  }[name]
                }
                <input
                  name={name}
                  type="number"
                  min="0"
                  max={Number.MAX_SAFE_INTEGER}
                  step="1"
                  value={query[name] ?? ""}
                />
              </label>
            ))}
            <label>
              投稿日（開始）{" "}
              <input
                type="date"
                name="since"
                value={query.since.slice(0, 10)}
              />
            </label>
            <label>
              投稿日（終了）{" "}
              <input
                type="date"
                name="until"
                value={query.until.slice(0, 10)}
              />
            </label>
            <label>
              並び替え{" "}
              <select name="orderField">
                <option
                  value="createdAt"
                  selected={query.orderField === "createdAt"}
                >
                  投稿日
                </option>
                <option
                  value="likesCount"
                  selected={query.orderField === "likesCount"}
                >
                  いいね数
                </option>
                <option
                  value="stocksCount"
                  selected={query.orderField === "stocksCount"}
                >
                  ストック数
                </option>
              </select>
            </label>
            <label>
              順序{" "}
              <select name="orderDirection">
                <option value="desc" selected={query.orderDirection === "desc"}>
                  降順
                </option>
                <option value="asc" selected={query.orderDirection === "asc"}>
                  昇順
                </option>
              </select>
            </label>
            <label>
              表示件数{" "}
              <input
                name="limit"
                type="number"
                min="1"
                max="100"
                value={query.limit}
              />
            </label>
            <input type="hidden" name="offset" value="0" />
            <button class="btn btn-primary" type="submit">
              検索する
            </button>
          </form>
          {articles.length === 0 && <p>該当する記事はありません。</p>}
          <div class="overflow-x-auto">
            <ArticlesTable articles={articles} />
          </div>
          <nav aria-label="記事のページ" class="my-4 flex items-center gap-3">
            {query.offset > 0 ? (
              <a
                class="btn"
                href={pageUrl(Math.max(0, query.offset - query.limit))}
              >
                前へ
              </a>
            ) : (
              <span class="btn btn-disabled" aria-disabled="true">
                前へ
              </span>
            )}
            <span>{Math.floor(query.offset / query.limit) + 1}</span>
            {articles.length === query.limit ? (
              <a class="btn" href={pageUrl(query.offset + query.limit)}>
                次へ
              </a>
            ) : (
              <span class="btn btn-disabled" aria-disabled="true">
                次へ
              </span>
            )}
          </nav>
        </div>
        <script id="articles-bootstrap" type="application/json">
          {raw(
            serializeArticleBootstrap({ config: query, articles, tagOptions }),
          )}
        </script>
      </PageLayout>
    </>
  );
};
