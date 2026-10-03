import { Header, PageLayout, PageTitle } from "@/components";
import {
  buttonVariants,
  cardClass,
  inputClass,
  selectClass,
  selectChevronClass,
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
import {
  analysisCardClass,
  analysisChartClass,
  analysisChartText,
  analysisActionFocusId,
  analysisActionSlotClass,
  analysisFieldClass,
  analysisFieldId,
  analysisFormClass,
  analysisIslandClass,
  analysisNoteClass,
  analysisResultsClass,
  analysisTagClearClass,
  analysisTagClearFocusId,
  analysisTagFieldClass,
  analysisTagLabelClass,
  analysisTagsClass,
} from "@/client/analysis-presentation";
import {
  analysisStateParams,
  analysisDraftError,
  normalizeAnalysisTags,
  serializeAnalysisBootstrap,
  type AnalysisBootstrap,
} from "@/client/analysis";
import { raw } from "hono/html";
import type { Child, FC } from "hono/jsx";

const Field: FC<{ id: string; label: string; children: Child }> = ({
  id,
  label,
  children,
}) => (
  <label class={analysisFieldClass} for={id}>
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

export const AnalysisPage: FC<AnalysisBootstrap> = (bootstrap) => {
  const { state, rows } = bootstrap;
  const tagOptions = normalizeAnalysisTags([
    ...bootstrap.tagOptions,
    ...state.tags,
  ]);
  const queryDraft = {
    since: state.since,
    until: state.until,
    bucket: state.bucket,
    author: state.author,
    tags: state.tags,
  };
  const validationError = analysisDraftError(queryDraft);
  if (validationError) throw new Error(validationError);
  const clearTagsUrl = `/analysis?${analysisStateParams({
    ...state,
    tags: [],
  })}`;

  return (
    <>
      <Header />
      <PageTitle label="記事の時系列分析" />
      <PageLayout>
        <div id="analysis-app">
          <section class={analysisIslandClass} aria-label="時系列分析">
            <div data-slot="card" class={cn(cardClass, analysisCardClass)}>
              <details class="mobile-filters">
                <summary>絞り込み・表示設定</summary>
                <form action="/analysis" method="get" class={analysisFormClass}>
                  <Field id={analysisFieldId("since")} label="開始日（UTC）">
                    <input
                      data-slot="input"
                      class={inputClass}
                      id={analysisFieldId("since")}
                      name="since"
                      type="date"
                      value={state.since}
                    />
                  </Field>
                  <Field id={analysisFieldId("until")} label="終了日（UTC）">
                    <input
                      data-slot="input"
                      class={inputClass}
                      id={analysisFieldId("until")}
                      name="until"
                      type="date"
                      value={state.until}
                    />
                  </Field>
                  <Field id={analysisFieldId("bucket")} label="集計単位">
                    <div data-slot="select-wrapper" class={selectWrapperClass}>
                      <select
                        data-slot="select"
                        class={selectClass}
                        id={analysisFieldId("bucket")}
                        name="bucket"
                      >
                        {(
                          [
                            ["day", "日"],
                            ["week", "週"],
                            ["month", "月"],
                          ] as const
                        ).map(([value, label]) => (
                          <option
                            key={value}
                            value={value}
                            selected={state.bucket === value}
                          >
                            {label}
                          </option>
                        ))}
                      </select>
                      <SelectChevron />
                    </div>
                  </Field>
                  <Field
                    id={analysisFieldId("author")}
                    label="投稿者（ID・名前）"
                  >
                    <input
                      data-slot="input"
                      class={inputClass}
                      id={analysisFieldId("author")}
                      name="author"
                      value={state.author}
                    />
                  </Field>
                  <div
                    class={analysisTagFieldClass}
                    data-slot="analysis-tags-field"
                  >
                    <label
                      class={analysisTagLabelClass}
                      for={analysisFieldId("tags")}
                    >
                      タグ（すべて一致）{" "}
                      <div
                        data-slot="select-wrapper"
                        class={cn(selectWrapperClass, analysisTagsClass)}
                      >
                        <select
                          data-slot="select"
                          class={cn(
                            selectClass,
                            selectMultipleClass,
                            analysisTagsClass,
                          )}
                          id={analysisFieldId("tags")}
                          name="tags"
                          multiple
                          size={4}
                        >
                          {tagOptions.map((tag) => (
                            <option
                              key={tag}
                              value={tag}
                              selected={state.tags.includes(tag)}
                            >
                              {tag}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <a
                      href={clearTagsUrl}
                      class={analysisTagClearClass}
                      data-focus-id={analysisTagClearFocusId}
                    >
                      タグを解除
                    </a>
                  </div>
                  <Field id={analysisFieldId("metric")} label="指標">
                    <div data-slot="select-wrapper" class={selectWrapperClass}>
                      <select
                        data-slot="select"
                        class={selectClass}
                        id={analysisFieldId("metric")}
                        name="metric"
                      >
                        <option
                          value="posts"
                          selected={state.metric === "posts"}
                        >
                          記事数
                        </option>
                        <option
                          value="likes"
                          selected={state.metric === "likes"}
                        >
                          いいね数
                        </option>
                      </select>
                      <SelectChevron />
                    </div>
                  </Field>
                  <Field id={analysisFieldId("view")} label="表示">
                    <div data-slot="select-wrapper" class={selectWrapperClass}>
                      <select
                        data-slot="select"
                        class={selectClass}
                        id={analysisFieldId("view")}
                        name="view"
                      >
                        <option value="table" selected={state.view === "table"}>
                          表
                        </option>
                        <option value="chart" selected={state.view === "chart"}>
                          グラフ
                        </option>
                      </select>
                      <SelectChevron />
                    </div>
                  </Field>
                  <div
                    class={analysisActionSlotClass}
                    data-slot="analysis-search-action"
                  >
                    <button
                      type="submit"
                      data-slot="button"
                      data-variant="default"
                      data-size="default"
                      class={buttonVariants({ className: "h-9 w-28" })}
                      data-focus-id={analysisActionFocusId}
                    >
                      適用
                    </button>
                  </div>
                </form>
              </details>
              <p class={analysisNoteClass}>
                いいね数は各期間に公開された記事の現在値であり、その期間中に獲得した数ではありません。
              </p>
              {state.view === "chart" && (
                <figure aria-label={analysisChartText(state.metric).label}>
                  <figcaption class="sr-only">
                    {analysisChartText(state.metric).label}
                  </figcaption>
                  <p class="mb-2 text-sm">
                    {analysisChartText(state.metric).description}
                  </p>
                  <div class={analysisChartClass} aria-hidden="true" />
                </figure>
              )}
              <div role="status" aria-live="polite">
                {rows.length}期間
              </div>
              {rows.length > 0 &&
                rows.every((row) =>
                  state.metric === "likes"
                    ? row.publishedArticleLikes === 0
                    : row.articleCount === 0,
                ) && <p>該当するデータはありません。</p>}
              <div class={analysisResultsClass} aria-busy="false">
                <div data-slot="table-container" class={tableContainerClass}>
                  <table data-slot="table" class={tableClass}>
                    <caption class="sr-only">時系列分析の集計表</caption>
                    <thead data-slot="table-header" class={tableHeaderClass}>
                      <tr data-slot="table-row" class={tableRowClass}>
                        <th
                          scope="col"
                          data-slot="table-head"
                          class={tableHeadClass}
                        >
                          期間開始日（UTC）
                        </th>
                        <th
                          scope="col"
                          data-slot="table-head"
                          class={tableHeadClass}
                        >
                          記事数
                        </th>
                        <th
                          scope="col"
                          data-slot="table-head"
                          class={tableHeadClass}
                        >
                          公開記事の現在のいいね数
                        </th>
                      </tr>
                    </thead>
                    <tbody data-slot="table-body" class={tableBodyClass}>
                      {rows.map((row) => (
                        <tr
                          key={row.bucketStart}
                          data-slot="table-row"
                          class={tableRowClass}
                        >
                          <td data-slot="table-cell" class={tableCellClass}>
                            {row.bucketStart}
                          </td>
                          <td data-slot="table-cell" class={tableCellClass}>
                            {row.articleCount}
                          </td>
                          <td data-slot="table-cell" class={tableCellClass}>
                            {row.publishedArticleLikes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </div>
        <script id="analysis-bootstrap" type="application/json">
          {raw(serializeAnalysisBootstrap(bootstrap))}
        </script>
      </PageLayout>
    </>
  );
};
