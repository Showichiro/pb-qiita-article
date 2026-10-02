/**
 * Layout contract shared by the ranking React island and its Hono fallback.
 *
 * This file is `.tsx` so Tailwind's tsx content glob can see the class literals.
 */

export const rankingIslandClass = "react-island";
export const rankingCardExtraClass = "gap-4 p-4";
export const rankingFormClass = "flex flex-wrap items-end gap-3";
export const rankingActionClass =
  "flex h-9 w-28 items-center justify-center whitespace-nowrap";
export const rankingResultsClass = "overflow-x-auto";
export const rankingLinkClass = "underline underline-offset-4";
export const rankingChartFrameClass = "h-[320px] w-full min-w-0";

export const rankingFieldId = (name: string) => `ranking-${name}`;
