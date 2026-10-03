import { NativePeriodShortcuts } from "@/pages/period-shortcuts";
import { NativeFilterSheet } from "@/pages/filter-sheet";
import {
  articleQueryParams,
  normalizeTags,
  rangeFields,
  type ArticleQuery,
} from "@/client/articles";
import {
  articleColumnLabels,
  articleFieldId,
  articleOrderDirections,
  articleOrderFields,
  articlesCardExtraClass,
  articlesFormClass,
  articlesActionFocusId,
  articlesActionSlotClass,
  articlesIslandClass,
  articlesLinkClass,
  articlesNavClass,
  articlesResultsClass,
  articlesTagClearClass,
  articlesTagClearFocusId,
  articlesTagControlClass,
  articlesTagFieldClass,
  articlesTagLabelClass,
  articlesTagClass,
} from "@/client/articles-presentation";
import {
  buttonVariants,
  cardClass,
  inputClass,
  selectChevronClass,
  selectClass,
  selectIconClass,
  selectMultipleClass,
  selectWrapperClass,
  tableBodyClass,
  tableCellClass,
  tableClass,
  tableContainerClass,
  tableHeadClass,
  tableHeaderClass,
  tableRowClass,
} from "@/client/ui/classes";
import { cn } from "@/client/ui/utils";
import type { Article } from "@/schemas";
import type { Child, FC } from "hono/jsx";

const pagerClass = buttonVariants({ variant: "outline" });
const rangeLabels = {
  minLikes: "いいね数（下限）",
  maxLikes: "いいね数（上限）",
  minStocks: "ストック数（下限）",
  maxStocks: "ストック数（上限）",
} satisfies Record<(typeof rangeFields)[number], string>;

const SearchField: FC<{ id: string; label: string; children: Child }> = ({
  id,
  label,
  children,
}) => (
  <label for={id}>
    {label} {children}
  </label>
);

const SelectChevron: FC = () => (
  <span data-slot="select-icon" aria-hidden="true" class={selectIconClass}>
    <svg
      class={selectChevronClass}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <title>Chevron</title>
      <path d="m6 9 6 6 6-6" />
    </svg>
  </span>
);

const PagerControl: FC<{ label: string; href?: string }> = ({ label, href }) =>
  href ? (
    <a
      href={href}
      data-slot="button"
      data-variant="outline"
      data-size="default"
      class={pagerClass}
    >
      {label}
    </a>
  ) : (
    <button
      type="button"
      disabled
      data-slot="button"
      data-variant="outline"
      data-size="default"
      class={pagerClass}
    >
      {label}
    </button>
  );

export const ArticlesSearch: FC<{
  query: ArticleQuery;
  articles: Article[];
  tagOptions?: string[];
}> = ({ query, articles, tagOptions = [] }) => {
  const options = normalizeTags([...tagOptions, ...query.tags]);
  const pageUrl = (offset: number) =>
    `/articles?${articleQueryParams({ ...query, offset })}`;
  const clearTagsUrl = `/articles?${articleQueryParams({
    ...query,
    tags: [],
    offset: 0,
  })}`;
  return (
    <section class={articlesIslandClass} aria-label="記事検索">
      <div data-slot="card" class={cn(cardClass, articlesCardExtraClass)}>
        <NativePeriodShortcuts
          range={query}
          href={(range) =>
            `/articles?${articleQueryParams({ ...query, ...range, offset: 0 })}`
          }
        />
        <NativeFilterSheet id="articles-filters">
          <form
            id="articles-filters-form"
            action="/articles"
            method="get"
            class={articlesFormClass}
          >
            {(["q", "author"] as const).map((name) => (
              <SearchField
                key={name}
                id={articleFieldId(name)}
                label={
                  name === "q" ? "キーワード（タイトル）" : "投稿者（ID・名前）"
                }
              >
                <input
                  data-slot="input"
                  class={inputClass}
                  id={articleFieldId(name)}
                  name={name}
                  maxLength={200}
                  value={query[name]}
                />
              </SearchField>
            ))}
            <div class={articlesTagFieldClass} data-slot="article-tags-field">
              <label class={articlesTagLabelClass} for={articleFieldId("tags")}>
                タグ（すべて一致）{" "}
                <div
                  data-slot="select-wrapper"
                  class={cn(selectWrapperClass, articlesTagControlClass)}
                >
                  <select
                    data-slot="select"
                    class={cn(
                      selectClass,
                      selectMultipleClass,
                      articlesTagControlClass,
                    )}
                    id={articleFieldId("tags")}
                    name="tags"
                    multiple
                    size={4}
                  >
                    {options.map((tag) => (
                      <option
                        key={tag}
                        value={tag}
                        selected={query.tags.includes(tag)}
                      >
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <a
                href={clearTagsUrl}
                class={articlesTagClearClass}
                data-focus-id={articlesTagClearFocusId}
              >
                タグを解除
              </a>
            </div>
            {rangeFields.map((name) => (
              <SearchField
                key={name}
                id={articleFieldId(name)}
                label={rangeLabels[name]}
              >
                <input
                  data-slot="input"
                  class={inputClass}
                  id={articleFieldId(name)}
                  name={name}
                  type="number"
                  min="0"
                  max={Number.MAX_SAFE_INTEGER}
                  step="1"
                  value={query[name] ?? ""}
                />
              </SearchField>
            ))}
            <SearchField id={articleFieldId("since")} label="投稿日（開始）">
              <input
                data-slot="input"
                class={inputClass}
                type="date"
                id={articleFieldId("since")}
                name="since"
                value={query.since.slice(0, 10)}
              />
            </SearchField>
            <SearchField id={articleFieldId("until")} label="投稿日（終了）">
              <input
                data-slot="input"
                class={inputClass}
                type="date"
                id={articleFieldId("until")}
                name="until"
                value={query.until.slice(0, 10)}
              />
            </SearchField>
            <SearchField id={articleFieldId("orderField")} label="並び替え">
              <div data-slot="select-wrapper" class={selectWrapperClass}>
                <select
                  data-slot="select"
                  class={selectClass}
                  id={articleFieldId("orderField")}
                  name="orderField"
                >
                  {articleOrderFields.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      selected={query.orderField === option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </SearchField>
            <SearchField id={articleFieldId("orderDirection")} label="順序">
              <div data-slot="select-wrapper" class={selectWrapperClass}>
                <select
                  data-slot="select"
                  class={selectClass}
                  id={articleFieldId("orderDirection")}
                  name="orderDirection"
                >
                  {articleOrderDirections.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      selected={query.orderDirection === option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </SearchField>
            <SearchField id={articleFieldId("limit")} label="表示件数">
              <input
                data-slot="input"
                class={inputClass}
                id={articleFieldId("limit")}
                name="limit"
                type="number"
                min="1"
                max="100"
                value={query.limit}
              />
            </SearchField>
            <input
              data-slot="input"
              class={inputClass}
              type="hidden"
              name="offset"
              value="0"
            />
            <div
              class={articlesActionSlotClass}
              data-slot="article-search-action"
            >
              <button
                type="submit"
                data-slot="button"
                data-variant="default"
                data-size="default"
                data-focus-id={articlesActionFocusId}
                class={buttonVariants({ className: "h-9 w-28" })}
              >
                検索する
              </button>
            </div>
          </form>
        </NativeFilterSheet>
        <div role="status" aria-live="polite" />
        <div role="status" aria-live="polite">
          {articles.length}件
        </div>
        {articles.length === 0 && <p>該当する記事はありません。</p>}
        <div class={articlesResultsClass} aria-busy="false">
          <div data-slot="table-container" class={tableContainerClass}>
            <table data-slot="table" class={tableClass}>
              <thead data-slot="table-header" class={tableHeaderClass}>
                <tr data-slot="table-row" class={tableRowClass}>
                  {articleColumnLabels.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      data-slot="table-head"
                      class={tableHeadClass}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody data-slot="table-body" class={tableBodyClass}>
                {articles.map((article) => (
                  <tr
                    key={article.id}
                    data-slot="table-row"
                    class={tableRowClass}
                  >
                    <td
                      data-slot="table-cell"
                      data-label={articleColumnLabels[0]}
                      class={tableCellClass}
                    >
                      <a
                        class={articlesLinkClass}
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`https://qiita.com/${encodeURIComponent(article.userId)}/items/${encodeURIComponent(article.id)}`}
                      >
                        {article.title}
                      </a>
                    </td>
                    <td
                      data-slot="table-cell"
                      data-label={articleColumnLabels[1]}
                      class={tableCellClass}
                    >
                      <a
                        class={articlesLinkClass}
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`https://qiita.com/${encodeURIComponent(article.userId)}`}
                      >
                        {article.userId}
                        {article.userName && `(${article.userName})`}
                      </a>
                    </td>
                    <td
                      data-slot="table-cell"
                      data-label={articleColumnLabels[2]}
                      class={tableCellClass}
                    >
                      <ul>
                        {article.tags.map((tag) => (
                          <li key={tag.name} class={articlesTagClass}>
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
                    </td>
                    <td
                      data-slot="table-cell"
                      data-label={articleColumnLabels[3]}
                      class={tableCellClass}
                    >
                      {article.likesCount}
                    </td>
                    <td
                      data-slot="table-cell"
                      data-label={articleColumnLabels[4]}
                      class={tableCellClass}
                    >
                      {article.stocksCount}
                    </td>
                    <td
                      data-slot="table-cell"
                      data-label={articleColumnLabels[5]}
                      class={tableCellClass}
                    >
                      {article.createdAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <nav class={articlesNavClass} aria-label="記事のページ">
          <PagerControl
            label="前へ"
            href={
              query.offset > 0
                ? pageUrl(Math.max(0, query.offset - query.limit))
                : undefined
            }
          />
          <span>{Math.floor(query.offset / query.limit) + 1}</span>
          <PagerControl
            label="次へ"
            href={
              articles.length === query.limit
                ? pageUrl(query.offset + query.limit)
                : undefined
            }
          />
        </nav>
      </div>
    </section>
  );
};
