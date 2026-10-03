/**
 * Layout contract shared by the articles React island and its Hono fallback.
 *
 * PR431 adaptation boundary: add keyword, author, tag, and count-range fields
 * in both forms, before the date fields, using these ids and the primitive
 * classes in `ui/classes.ts`. Keep the native GET form, hidden offset 0, and
 * anchor pagination in the fallback. A multiple select should append
 * `h-auto appearance-auto pr-3` and omit the chevron; do not restyle the
 * date, order, or limit controls for that case.
 * This file is `.tsx` so Tailwind's tsx content glob can see the class literals.
 */

export const articlesIslandClass = "react-island";
export const articlesCardExtraClass = "gap-4 p-4";
export const articlesFormClass = "flex flex-wrap items-end gap-3";
export const articlesTagFieldClass = "block w-full min-w-0 max-w-full sm:w-64";
export const articlesTagLabelClass = "block w-full min-w-0 max-w-full sm:w-64";
export const articlesTagControlClass = "block w-full min-w-0 max-w-full";
export const articlesTagClearClass =
  "inline-flex min-h-9 items-center underline underline-offset-4";
export const articlesTagClearFocusId = "articles-tag-clear";
export const articlesActionSlotClass = "flex h-9 w-28 items-center";
export const articlesActionHintClass = "text-sm text-muted-foreground";
export const articlesActionFocusId = "articles-auto-search";
export const articlesResultsClass = "overflow-x-auto";
export const articlesNavClass = "my-4 flex items-center gap-3";
export const articlesLinkClass = "underline underline-offset-4";
export const articlesTagClass =
  "inline-flex rounded-full border px-2 py-0.5 text-xs";

export const articleColumnLabels = [
  "タイトル",
  "執筆者",
  "タグ",
  "いいね数",
  "ストック数",
  "投稿日",
] as const;

export const articleOrderFields = [
  { value: "createdAt", label: "投稿日" },
  { value: "likesCount", label: "いいね数" },
  { value: "stocksCount", label: "ストック数" },
] as const;

export const articleOrderDirections = [
  { value: "desc", label: "降順" },
  { value: "asc", label: "昇順" },
] as const;

export const articleFieldId = (name: string) => `articles-${name}`;
