import { NativePeriodShortcuts } from "@/pages/period-shortcuts";
import { configQueryParams } from "@/client/articles";
import { NativeFilterSheet } from "@/pages/filter-sheet";
import {
  Header,
  PageLayout,
  PageTitle,
  RankingScrollMenu,
  ToTopButton,
} from "@/components";
import type { RankingConfig } from "@/db";
import { dateTimetoDateString } from "@/util/dateFormatUtils";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import {
  rankingIslandClass,
  rankingActionClass,
  rankingCardExtraClass,
  rankingFormClass,
  rankingFieldId,
  rankingResultsClass,
  rankingLinkClass,
} from "@/client/ranking-presentation";
import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import {
  buttonVariants,
  cardClass,
  inputClass,
  tableBodyClass,
  tableCellClass,
  tableClass,
  tableContainerClass,
  tableHeadClass,
  tableHeaderClass,
  tableRowClass,
} from "@/client/ui/classes";
import { cn } from "@/client/ui/utils";
import type { RankingQuery } from "@/client/ranking";
import { rankingChartFrameClass } from "@/client/ranking-presentation";
import {
  selectChevronClass,
  selectClass,
  selectIconClass,
  selectOptionClass,
  selectWrapperClass,
} from "@/client/ui/classes";

export const RankingPage: FC<{
  bootstrap: string;
  config: RankingConfig & Pick<RankingQuery, "view" | "topN">;
  postCounts: ArticleCountGroupByUser[];
  likesCounts: LikesCountSchema[];
}> = ({ bootstrap, config, postCounts, likesCounts }) => {
  const buttonClass = buttonVariants();
  const postRows = postCounts.slice(0, config.topN);
  const likesRows = likesCounts.slice(0, config.topN);
  return (
    <>
      <Header>
        <RankingScrollMenu />
      </Header>
      <PageTitle label="記事数・いいね数ランキング" />
      <PageLayout>
        <div id="ranking-app" class={rankingIslandClass}>
          <script id="ranking-bootstrap" type="application/json">
            {raw(bootstrap)}
          </script>
          <section aria-label="ランキング検索">
            <div data-slot="card" class={cn(cardClass, rankingCardExtraClass)}>
              <NativePeriodShortcuts
                range={{ since: config.since ?? "", until: config.until ?? "" }}
                href={(range) =>
                  `/ranking?${configQueryParams({ ...config, ...range })}`
                }
              />
              <NativeFilterSheet id="ranking-filters">
                <form
                  id="ranking-filters-form"
                  action="/ranking"
                  method="get"
                  class={rankingFormClass}
                >
                  <label for={rankingFieldId("since")}>
                    開始日{" "}
                    <input
                      data-slot="input"
                      class={inputClass}
                      type="date"
                      id={rankingFieldId("since")}
                      name="since"
                      value={
                        config.since
                          ? dateTimetoDateString(config.since)
                          : undefined
                      }
                    />
                  </label>
                  <label for={rankingFieldId("until")}>
                    終了日{" "}
                    <input
                      data-slot="input"
                      class={inputClass}
                      type="date"
                      id={rankingFieldId("until")}
                      name="until"
                      value={
                        config.until
                          ? dateTimetoDateString(config.until)
                          : undefined
                      }
                    />
                  </label>
                  <label for={rankingFieldId("view")}>
                    表示形式{" "}
                    <div data-slot="select-wrapper" class={selectWrapperClass}>
                      <select
                        data-slot="select"
                        class={selectClass}
                        id={rankingFieldId("view")}
                        name="view"
                      >
                        <option
                          data-slot="select-option"
                          class={selectOptionClass}
                          value="table"
                          selected={config.view === "table"}
                        >
                          表
                        </option>
                        <option
                          data-slot="select-option"
                          class={selectOptionClass}
                          value="chart"
                          selected={config.view === "chart"}
                        >
                          グラフ
                        </option>
                      </select>
                      <span
                        data-slot="select-icon"
                        aria-hidden="true"
                        class={selectIconClass}
                      >
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
                    </div>
                  </label>
                  <label for={rankingFieldId("topN")}>
                    表示件数{" "}
                    <div data-slot="select-wrapper" class={selectWrapperClass}>
                      <select
                        data-slot="select"
                        class={selectClass}
                        id={rankingFieldId("topN")}
                        name="topN"
                      >
                        {Array.from(
                          { length: 100 },
                          (_, index) => index + 1,
                        ).map((count) => (
                          <option
                            data-slot="select-option"
                            class={selectOptionClass}
                            value={String(count)}
                            selected={config.topN === count}
                            key={count}
                          >
                            {count}件
                          </option>
                        ))}
                      </select>
                      <span
                        data-slot="select-icon"
                        aria-hidden="true"
                        class={selectIconClass}
                      >
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
                    </div>
                  </label>
                  <button
                    type="submit"
                    data-slot="button"
                    data-variant="default"
                    data-size="default"
                    data-ranking-action=""
                    class={cn(buttonClass, rankingActionClass)}
                  >
                    検索する
                  </button>
                </form>
              </NativeFilterSheet>
              <div role="status" aria-live="polite" />
              <div role="status" aria-live="polite">
                {postRows.length}件の投稿, {likesRows.length}件のいいね
              </div>
              {postRows.length === 0 && likesRows.length === 0 && (
                <p role="status">該当するデータはありません。</p>
              )}
              <div class={rankingResultsClass} aria-busy="false">
                <div class="grid grid-rows-2 gap-4">
                  <section aria-labelledby="posts">
                    <h2 id="posts" class="text-3xl">
                      記事数ランキング
                    </h2>
                    {config.view === "chart" && (
                      <div class={rankingChartFrameClass} aria-hidden="true" />
                    )}
                    <div
                      data-slot="table-container"
                      class={tableContainerClass}
                    >
                      <table
                        data-slot="table"
                        class={tableClass}
                        aria-label="記事数ランキング"
                      >
                        <thead
                          data-slot="table-header"
                          class={tableHeaderClass}
                        >
                          <tr data-slot="table-row" class={tableRowClass}>
                            <th
                              scope="col"
                              data-slot="table-head"
                              class={tableHeadClass}
                            >
                              順位
                            </th>
                            <th
                              scope="col"
                              data-slot="table-head"
                              class={tableHeadClass}
                            >
                              執筆者
                            </th>
                            <th
                              scope="col"
                              data-slot="table-head"
                              class={tableHeadClass}
                            >
                              記事数
                            </th>
                          </tr>
                        </thead>
                        <tbody data-slot="table-body" class={tableBodyClass}>
                          {postRows.map((user, index) => (
                            <tr
                              key={`article-count-${user.userId}`}
                              data-slot="table-row"
                              class={tableRowClass}
                            >
                              <td data-slot="table-cell" class={tableCellClass}>
                                {index + 1}
                              </td>
                              <td data-slot="table-cell" class={tableCellClass}>
                                <a
                                  class={rankingLinkClass}
                                  href={`https://qiita.com/${encodeURIComponent(user.userId)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {user.userId}
                                  <span>
                                    {user.userName !== "" &&
                                      `(${user.userName})`}
                                  </span>
                                </a>
                              </td>
                              <td data-slot="table-cell" class={tableCellClass}>
                                {user.count}
                              </td>
                            </tr>
                          ))}
                          {postRows.length === 0 && (
                            <tr data-slot="table-row" class={tableRowClass}>
                              <td
                                data-slot="table-cell"
                                class={tableCellClass}
                                colspan={3}
                              >
                                記事数データはありません。
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section aria-labelledby="likes">
                    <h2 id="likes" class="text-3xl">
                      いいね数ランキング
                    </h2>
                    <p>期間内に公開された記事の現在の合計いいね数です。</p>
                    {config.view === "chart" && (
                      <div class={rankingChartFrameClass} aria-hidden="true" />
                    )}
                    <div
                      data-slot="table-container"
                      class={tableContainerClass}
                    >
                      <table
                        data-slot="table"
                        class={tableClass}
                        aria-label="いいね数ランキング"
                      >
                        <thead
                          data-slot="table-header"
                          class={tableHeaderClass}
                        >
                          <tr data-slot="table-row" class={tableRowClass}>
                            <th
                              scope="col"
                              data-slot="table-head"
                              class={tableHeadClass}
                            >
                              順位
                            </th>
                            <th
                              scope="col"
                              data-slot="table-head"
                              class={tableHeadClass}
                            >
                              執筆者
                            </th>
                            <th
                              scope="col"
                              data-slot="table-head"
                              class={tableHeadClass}
                            >
                              いいね数
                            </th>
                          </tr>
                        </thead>
                        <tbody data-slot="table-body" class={tableBodyClass}>
                          {likesRows.map((user, index) => (
                            <tr
                              key={`likes-count-${user.userId}`}
                              data-slot="table-row"
                              class={tableRowClass}
                            >
                              <td data-slot="table-cell" class={tableCellClass}>
                                {index + 1}
                              </td>
                              <td data-slot="table-cell" class={tableCellClass}>
                                <a
                                  class={rankingLinkClass}
                                  href={`https://qiita.com/${encodeURIComponent(user.userId)}`}
                                  rel="noopener noreferrer"
                                >
                                  {user.userId}
                                  <span>
                                    {user.userName !== "" &&
                                      `(${user.userName})`}
                                  </span>
                                </a>
                              </td>
                              <td data-slot="table-cell" class={tableCellClass}>
                                {user.totalLikesCount ?? "—"}
                              </td>
                            </tr>
                          ))}
                          {likesRows.length === 0 && (
                            <tr data-slot="table-row" class={tableRowClass}>
                              <td
                                data-slot="table-cell"
                                class={tableCellClass}
                                colspan={3}
                              >
                                いいね数データはありません。
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </section>
        </div>
      </PageLayout>
      <ToTopButton />
    </>
  );
};
