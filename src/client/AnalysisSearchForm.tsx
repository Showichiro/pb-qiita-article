/** @jsxImportSource react */
import { PeriodShortcuts } from "./PeriodShortcuts";
import { ActiveFilters } from "./active-filters";
import { commonFilters } from "@/client/filter-state";
import { FilterSheet } from "./filter-sheet";
import { Input, Select } from "./ui";
import {
  analysisActionFocusId,
  analysisFieldClass,
  analysisFieldId,
  analysisTagClearClass,
  analysisTagClearFocusId,
  analysisTagFieldClass,
  analysisTagLabelClass,
  analysisTagsClass,
} from "./analysis-presentation";

import type { useAnalysisSearch } from "./useAnalysisSearch";

// Controlled form: state and search scheduling belong to useAnalysisSearch.
type Props = ReturnType<typeof useAnalysisSearch>["form"];

export function AnalysisSearchForm({
  draft,
  query,
  validationError,
  tagOptions,
  clearTagsHref,
  metric,
  view,
  submit,
  handleAuthorChange,
  handleImmediateChange,
  setDisplay,
  changeFilters,
  changeShortcut,
  handleKeyDown,
  startComposition,
  endComposition,
}: Props) {
  return (
    <>
      <PeriodShortcuts range={draft} dateOnly onChange={changeShortcut} />
      <form
        data-focus-id={analysisActionFocusId}
        tabIndex={-1}
        id="analysis-filters-form"
        action="/analysis"
        method="get"
        onSubmit={submit}
        onKeyDown={handleKeyDown}
        className="query-form"
      >
        <FilterSheet
          id="analysis-filters"
          count={
            commonFilters(query).filter((filter) => filter.key !== "period")
              .length
          }
          controls={
            <>
              {" "}
              <label
                className={analysisFieldClass}
                htmlFor={analysisFieldId("bucket")}
              >
                集計単位{" "}
                <Select
                  id={analysisFieldId("bucket")}
                  name="bucket"
                  value={draft.bucket}
                  onChange={(event) =>
                    handleImmediateChange("bucket", event.currentTarget.value)
                  }
                >
                  <option value="day">日</option>
                  <option value="week">週</option>
                  <option value="month">月</option>
                </Select>
              </label>
              <label
                className={analysisFieldClass}
                htmlFor={analysisFieldId("metric")}
              >
                指標{" "}
                <Select
                  id={analysisFieldId("metric")}
                  name="metric"
                  value={metric}
                  onChange={(event) =>
                    setDisplay(
                      event.currentTarget.value === "likes" ? "likes" : "posts",
                      view,
                    )
                  }
                >
                  <option value="posts">記事数</option>
                  <option value="likes">いいね数</option>
                </Select>
              </label>
              <label
                className={analysisFieldClass}
                htmlFor={analysisFieldId("view")}
              >
                表示{" "}
                <Select
                  id={analysisFieldId("view")}
                  name="view"
                  value={view}
                  onChange={(event) =>
                    setDisplay(
                      metric,
                      event.currentTarget.value === "chart" ? "chart" : "table",
                    )
                  }
                >
                  <option value="table">表</option>
                  <option value="chart">グラフ</option>
                </Select>
              </label>
            </>
          }
        >
          <fieldset className="filter-field-group">
            <legend>投稿者・タグ</legend>{" "}
            <label
              className={analysisFieldClass}
              htmlFor={analysisFieldId("author")}
            >
              投稿者（ID・名前）{" "}
              <Input
                id={analysisFieldId("author")}
                name="author"
                value={draft.author}
                onChange={(event) =>
                  handleAuthorChange(
                    event.currentTarget.value,
                    event.nativeEvent instanceof InputEvent &&
                      event.nativeEvent.isComposing,
                  )
                }
                onCompositionStart={startComposition}
                onCompositionEnd={(event) =>
                  endComposition(event.currentTarget.value)
                }
              />
            </label>
            <div
              className={analysisTagFieldClass}
              data-slot="analysis-tags-field"
            >
              <label
                className={analysisTagLabelClass}
                htmlFor={analysisFieldId("tags")}
              >
                タグ（すべて一致）{" "}
                <Select
                  id={analysisFieldId("tags")}
                  name="tags"
                  multiple
                  size={4}
                  className={analysisTagsClass}
                  wrapperClassName={analysisTagsClass}
                  value={draft.tags}
                  onChange={(event) =>
                    handleImmediateChange(
                      "tags",
                      Array.from(
                        event.currentTarget.selectedOptions,
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
                className={analysisTagClearClass}
                data-focus-id={analysisTagClearFocusId}
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
            <legend>投稿期間</legend>
            <label
              className={analysisFieldClass}
              htmlFor={analysisFieldId("since")}
            >
              開始日{" "}
              <Input
                id={analysisFieldId("since")}
                name="since"
                type="date"
                value={draft.since}
                aria-describedby={
                  validationError ? "analysis-validation" : undefined
                }
                onChange={(event) =>
                  handleImmediateChange("since", event.currentTarget.value)
                }
              />
            </label>
            <label
              className={analysisFieldClass}
              htmlFor={analysisFieldId("until")}
            >
              終了日{" "}
              <Input
                id={analysisFieldId("until")}
                name="until"
                type="date"
                value={draft.until}
                aria-describedby={
                  validationError ? "analysis-validation" : undefined
                }
                onChange={(event) =>
                  handleImmediateChange("until", event.currentTarget.value)
                }
              />
            </label>
          </fieldset>

          {validationError && (
            <p id="analysis-validation" role="alert">
              {validationError}
            </p>
          )}
        </FilterSheet>
        <ActiveFilters
          filters={commonFilters(query).filter(
            (filter) => filter.key !== "period",
          )}
          onRemove={(filter) => changeFilters(filter.clear)}
          onClear={() => changeFilters({ author: "", tags: [] })}
        />
        <p className="query-period-summary">
          期間: {query.since} 〜 {query.until}
        </p>{" "}
      </form>
    </>
  );
}
