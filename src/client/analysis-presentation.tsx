/**
 * Layout classes shared by the native /analysis response and React island.
 * Keep these utilities literal so Tailwind includes them in production CSS.
 */
export const analysisIslandClass = "react-island";
export const analysisCardClass = "gap-4 p-4";
export const analysisFormClass = "query-form";
export const analysisFieldClass = "block min-w-0 max-w-full sm:w-64";
export const analysisFilterClass = "block min-w-0 max-w-full sm:w-64";
export const analysisTagFieldClass = "block w-full min-w-0 max-w-full sm:w-64";
export const analysisTagLabelClass = "block w-full min-w-0 max-w-full sm:w-64";
export const analysisTagsClass = "block w-full min-w-0 max-w-full";
export const analysisTagClearClass =
  "inline-flex min-h-9 items-center underline underline-offset-4";
export const analysisTagClearFocusId = "analysis-tag-clear";
export const analysisActionSlotClass = "flex h-9 w-28 items-center";
export const analysisActionFocusId = "analysis-auto-search";
export const analysisResultsClass = "overflow-x-auto";
export const analysisChartClass = "h-[320px] w-full min-w-0 overflow-hidden";
export const analysisNoteClass = "text-sm text-muted-foreground";
export const analysisFieldId = (name: string) => `analysis-${name}`;

export function analysisChartText(metric: "posts" | "likes") {
  return metric === "likes"
    ? {
        label: "いいね数（その期間に公開された記事の現在値）",
        description:
          "いいね数は、各期間に公開された記事に現在付いている数です。期間中に獲得した数ではありません。",
      }
    : {
        label: "記事数（投稿日別）",
        description: "",
      };
}
