import type { Child, FC } from "hono/jsx";

export const PageLayout: FC<{ children: Child }> = ({ children }) => {
  return <div class="page-layout mt-6 mx-3 sm:mt-10 sm:mx-4">{children}</div>;
};
