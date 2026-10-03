import type { FC } from "hono/jsx";

/**
 * @description pageTitle
 * @param {string} label - label
 */
export const PageTitle: FC<{ label: string }> = ({ label }) => {
  return <h1 class="text-2xl m-3 break-words sm:text-4xl sm:m-4">{label}</h1>;
};
