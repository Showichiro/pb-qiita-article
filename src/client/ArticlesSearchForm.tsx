/** @jsxImportSource react */
import { japanDate } from "@/util/japanTime";
import { PeriodShortcuts } from "./PeriodShortcuts";
import { ActiveFilters } from "./active-filters";
import { articleFilters, articleSortOptions } from "./filter-state";
import { FilterSheet } from "./filter-sheet";
import { Input, Select } from "./ui";
import {
  articleFieldId,
  articlesActionFocusId,
  articlesTagControlClass,
  articlesTagClearClass,
  articlesTagClearFocusId,
  articlesTagFieldClass,
  articlesTagLabelClass,
} from "./articles-presentation";
import { rangeFields } from "./articles";

import type { useArticlesSearch } from "./useArticlesSearch";

// Controlled form: state and search scheduling belong to useArticlesSearch.
type Props = ReturnType<typeof useArticlesSearch>["form"];

export function ArticlesSearchForm({
  draft,
  query,
  validationError,
  tagOptions,
  clearTagsHref,
  submit,
  handleTextChange,
  handleImmediateChange,
  changeFilters,
  changeSort,
  changeShortcut,
  handleKeyDown,
  startComposition,
  endComposition,
}: Props) {
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
        onCompositionStart={startComposition}
        onCompositionEnd={(e) => endComposition(name, e.currentTarget.value)}
      />
    </label>
  );

  return (
    <>
      <PeriodShortcuts range={draft} onChange={changeShortcut} />
      <form
        data-focus-id={articlesActionFocusId}
        tabIndex={-1}
        id="articles-filters-form"
        action="/articles"
        method="get"
        noValidate
        onSubmit={submit}
        onKeyDown={handleKeyDown}
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
                onChange={(event) => changeSort(event.currentTarget.value)}
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
            articleFilters(query).filter((filter) => filter.key !== "q").length
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
                onChange={(e) => handleImmediateChange("since", e.target.value)}
              />
            </label>
            <label htmlFor={articleFieldId("until")}>
              投稿日（終了）{" "}
              <Input
                type="date"
                id={articleFieldId("until")}
                name="until"
                value={draft.until ? japanDate(draft.until) : ""}
                onChange={(e) => handleImmediateChange("until", e.target.value)}
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
    </>
  );
}

export function ArticlesPageSizeControl({
  draft,
  handleTextChange,
}: Pick<Props, "draft" | "handleTextChange">) {
  return (
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
  );
}
