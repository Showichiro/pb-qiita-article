/** @jsxImportSource react */
import type { FindAllArticlesConfig } from "@/db/findAllArticles";
import type { Article } from "@/schemas";
import { useLayoutEffect, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";

export type ArticlesInitialData = {
  initialConfig: FindAllArticlesConfig;
  initialArticles?: Article[];
};

type AppModule = { default: ComponentType<ArticlesInitialData> };
const roots = new WeakMap<HTMLElement, Root>();

export function readInitialData(container: HTMLElement): ArticlesInitialData {
  const bootstrap =
    container.ownerDocument.getElementById("articles-bootstrap");
  const data = bootstrap?.textContent
    ? JSON.parse(bootstrap.textContent)
    : undefined;
  const config = container.dataset.initialConfig;
  if (!data && !config)
    throw new Error("Missing articles initial configuration");
  const initialConfig: FindAllArticlesConfig = data
    ? data.config
    : JSON.parse(config ?? "null");
  if (!initialConfig || typeof initialConfig !== "object") {
    throw new Error("Invalid articles initial configuration");
  }
  const articles = container.dataset.initialArticles;
  const initialArticles: Article[] | undefined = data
    ? data.articles
    : articles
      ? JSON.parse(articles)
      : undefined;
  if (initialArticles !== undefined && !Array.isArray(initialArticles)) {
    throw new Error("Invalid articles initial data");
  }
  return { initialConfig, initialArticles };
}

export async function mountArticlesApp(
  container: HTMLElement,
  loadApp: () => Promise<AppModule> = () => import("./ArticlesApp"),
): Promise<void> {
  if (roots.has(container)) return;
  const props = readInitialData(container);
  // Import and render off-screen so a failed download or initial render leaves
  // the existing Hono SSR content available, including its ordinary links.
  const { default: App } = await loadApp();
  if (roots.has(container)) return;
  const clientContainer = document.createElement("div");
  const fallback = Array.from(container.childNodes);
  const root = createRoot(clientContainer, {
    onUncaughtError(error) {
      console.error("Could not render the articles application", error);
      container.replaceChildren(...fallback);
      roots.delete(container);
    },
  });
  roots.set(container, root);

  function Ready() {
    useLayoutEffect(() => {
      container.replaceChildren(clientContainer);
    }, []);
    return <App {...props} />;
  }

  root.render(<Ready />);
}
