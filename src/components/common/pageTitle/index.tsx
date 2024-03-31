import { FC } from "hono/jsx";

/**
 * @description pageTitle
 * @param {string} label - label
 */
export const PageTitle: FC<{ label: string }> = ({ label }) => {
  return <h1 class="text-4xl m-4">{label}</h1>;
};
