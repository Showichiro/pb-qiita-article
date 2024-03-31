import { Child, FC } from "hono/jsx";

export const PageLayout: FC<{ children: Child }> = ({ children }) => {
  return <div class="mt-10 mx-4">{children}</div>;
};
