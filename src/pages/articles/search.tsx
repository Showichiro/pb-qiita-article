import { NativeActiveFilters } from "@/pages/active-filters";
import { articleFilters, articleSortOptions } from "@/client/filter-state";
import { japanDate } from "@/util/japanTime";
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
  articlesCardExtraClass,
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
  const renderTextField = (name: "q" | "author") => (
    <SearchField
      key={name}
      id={articleFieldId(name)}
      label={name === "q" ? "キーワード（タイトル）" : "投稿者（ID・名前）"}
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
  );
  return (
    <section class={articlesIslandClass} aria-label="記事検索">
      <div data-slot="card" class={cn(cardClass, articlesCardExtraClass)}>
        <NativePeriodShortcuts
          range={query}
          href={(range) =>
            `/articles?${articleQueryParams({ ...query, ...range, offset: 0 })}`
          }
        />
        <form
          id="articles-filters-form"
          action="/articles"
          method="get"
          class="query-form"
        >
          <input
            data-slot="input"
            class={inputClass}
            type="hidden"
            name="orderField"
            value={query.orderField}
          />
          <input
            data-slot="input"
            class={inputClass}
            type="hidden"
            name="orderDirection"
            value={query.orderDirection}
          />
          <NativeFilterSheet
            id="articles-filters"
            search={renderTextField("q")}
            controls={
              <label class="sort-control" for={articleFieldId("sort")}>
                <span class="control-label">並び順</span>
                <div data-slot="select-wrapper" class={selectWrapperClass}>
                  <select
                    data-slot="select"
                    class={selectClass}
                    id={articleFieldId("sort")}
                    name="sort"
                  >
                    {articleSortOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        selected={
                          query.orderField + ":" + query.orderDirection ===
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
              </label>
            }
            count={
              articleFilters(query).filter((filter) => filter.key !== "q")
                .length
            }
          >
            <fieldset class="filter-field-group">
              <legend>投稿者・タグ</legend>
              {renderTextField("author")}{" "}
              <div class={articlesTagFieldClass} data-slot="article-tags-field">
                <label
                  class={articlesTagLabelClass}
                  for={articleFieldId("tags")}
                >
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
            </fieldset>
            <fieldset class="filter-field-group">
              <legend>いいね・ストック数</legend>{" "}
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
            </fieldset>
            <fieldset class="filter-field-group">
              <legend>投稿期間</legend>{" "}
              <SearchField id={articleFieldId("since")} label="投稿日（開始）">
                <input
                  data-slot="input"
                  class={inputClass}
                  type="date"
                  id={articleFieldId("since")}
                  name="since"
                  value={query.since ? japanDate(query.since) : ""}
                />
              </SearchField>
              <SearchField id={articleFieldId("until")} label="投稿日（終了）">
                <input
                  data-slot="input"
                  class={inputClass}
                  type="date"
                  id={articleFieldId("until")}
                  name="until"
                  value={query.until ? japanDate(query.until) : ""}
                />
              </SearchField>
            </fieldset>
          </NativeFilterSheet>
          <NativeActiveFilters
            filters={articleFilters(query)}
            href={(filter) => {
              const cleared = filter
                ? filter.clear
                : {
                    q: "",
                    author: "",
                    tags: [],
                    minLikes: "",
                    maxLikes: "",
                    minStocks: "",
                    maxStocks: "",
                    since: "",
                    until: "",
                  };
              return (
                "/articles?" +
                articleQueryParams({
                  ...query,
                  ...cleared,
                  ...Object.fromEntries(
                    ["minLikes", "maxLikes", "minStocks", "maxStocks"]
                      .filter((key) => key in cleared)
                      .map((key) => [key, null]),
                  ),
                  offset: 0,
                })
              );
            }}
          />{" "}
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
                      {article.createdAt ? japanDate(article.createdAt) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div class="page-size-control">
          <SearchField id={articleFieldId("limit")} label="1ページの件数">
            <input
              data-slot="input"
              class={inputClass}
              id={articleFieldId("limit")}
              name="limit"
              form="articles-filters-form"
              type="number"
              min="1"
              max="100"
              value={query.limit}
            />
          </SearchField>
        </div>{" "}
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
