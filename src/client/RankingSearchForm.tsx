/** @jsxImportSource react */
import { japanDate } from "@/util/japanTime";
import { PeriodShortcuts } from "./PeriodShortcuts";
import { ActiveFilters } from "./active-filters";
import { commonFilters } from "@/client/filter-state";
import { FilterSheet } from "./filter-sheet";
import { Input, Select } from "./ui";
import { rankingFieldId } from "./ranking-presentation";

import type { useRankingSearch } from "./useRankingSearch";

// Controlled form: state and search scheduling belong to useRankingSearch.
type Props = ReturnType<typeof useRankingSearch>["form"];

export function RankingSearchForm({
  draft,
  query,
  validationError,
  handleSubmit,
  handleDateChange,
  changeView,
  changeTopN,
  changePeriod,
  changeShortcut,
}: Props) {
  return (
    <>
      <PeriodShortcuts range={draft} onChange={changeShortcut} />
      <form
        data-ranking-action=""
        tabIndex={-1}
        id="ranking-filters-form"
        action="/ranking"
        method="get"
        onSubmit={handleSubmit}
        className="query-form"
      >
        <FilterSheet
          id="ranking-filters"
          count={commonFilters(query).length}
          controls={
            <>
              <label htmlFor={rankingFieldId("view")}>
                表示形式{" "}
                <Select
                  id={rankingFieldId("view")}
                  name="view"
                  value={query.view}
                  onChange={(event) =>
                    changeView(
                      event.currentTarget.value === "chart" ? "chart" : "table",
                    )
                  }
                >
                  <option value="table">表</option>
                  <option value="chart">グラフ</option>
                </Select>
              </label>
              <label htmlFor={rankingFieldId("topN")}>
                表示件数{" "}
                <Select
                  id={rankingFieldId("topN")}
                  name="topN"
                  value={String(query.topN)}
                  onChange={(event) =>
                    changeTopN(parseTopNControl(event.currentTarget.value))
                  }
                >
                  {Array.from({ length: 100 }, (_, index) => index + 1).map(
                    (count) => (
                      <option key={count} value={count}>
                        {count}件
                      </option>
                    ),
                  )}
                </Select>
              </label>
            </>
          }
        >
          <fieldset className="filter-field-group">
            <legend>投稿期間</legend>
            <label htmlFor={rankingFieldId("since")}>
              開始日{" "}
              <Input
                type="date"
                id={rankingFieldId("since")}
                name="since"
                aria-describedby={
                  validationError ? "ranking-date-validation-error" : undefined
                }
                value={draft.since ? japanDate(draft.since) : ""}
                onChange={(event) =>
                  handleDateChange("since", event.currentTarget.value)
                }
              />
            </label>
            <label htmlFor={rankingFieldId("until")}>
              終了日{" "}
              <Input
                type="date"
                id={rankingFieldId("until")}
                name="until"
                aria-describedby={
                  validationError ? "ranking-date-validation-error" : undefined
                }
                value={draft.until ? japanDate(draft.until) : ""}
                onChange={(event) =>
                  handleDateChange("until", event.currentTarget.value)
                }
              />
            </label>
          </fieldset>

          {validationError && (
            <p id="ranking-date-validation-error" role="alert">
              {validationError}
            </p>
          )}
        </FilterSheet>
        <ActiveFilters
          filters={commonFilters(query)}
          onRemove={(filter) => changePeriod(filter.clear)}
          onClear={() => changePeriod({ since: "", until: "" })}
        />{" "}
      </form>
    </>
  );
}

function parseTopNControl(value: string): number {
  const count = Number(value);
  return Number.isInteger(count) ? Math.max(1, Math.min(100, count)) : 10;
}
