/** @jsxImportSource react */
import type { FindAllArticlesConfig } from "@/db/findAllArticles";
import type { Article } from "@/schemas";
import { useLayoutEffect, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  parseArticleQuery,
  toArticleDraft,
  type ArticleDraft,
} from "./articles";

export type ArticlesInitialData = {
  initialConfig: FindAllArticlesConfig;
  initialArticles?: Article[];
};

type AppModule = {
  default: ComponentType<ArticlesInitialData & { initialDraft?: ArticleDraft }>;
};
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
  let editVersion = 0;
  const edited = () => {
    editVersion++;
  };
  container.addEventListener("input", edited, true);
  container.addEventListener("change", edited, true);
  const stopTracking = () => {
    container.removeEventListener("input", edited, true);
    container.removeEventListener("change", edited, true);
  };
  let App: AppModule["default"];
  try {
    ({ default: App } = await loadApp());
  } catch (error) {
    stopTracking();
    throw error;
  }
  if (roots.has(container)) {
    stopTracking();
    return;
  }
  const clientContainer = document.createElement("div");
  const fallback = Array.from(container.childNodes);
  const root = createRoot(clientContainer, {
    onUncaughtError(error) {
      stopTracking();
      console.error("Could not render the articles application", error);
      container.replaceChildren(...fallback);
      roots.delete(container);
    },
  });
  roots.set(container, root);

  const version = editVersion;
  const form = container.querySelector("form");
  const draft = form ? readDraft(form, props.initialConfig) : undefined;
  function Ready() {
    useLayoutEffect(() => {
      stopTracking();
      // Preserve the native form if an edit lands between render and commit.
      if (version !== editVersion) {
        queueMicrotask(() => {
          root.unmount();
          roots.delete(container);
        });
        return;
      }
      const focused = container.ownerDocument.activeElement;
      const focusName =
        focused && container.contains(focused)
          ? focused.getAttribute("name")
          : null;
      const selection =
        focused instanceof HTMLInputElement && focused.selectionStart !== null
          ? {
              start: focused.selectionStart,
              end: focused.selectionEnd,
              direction: focused.selectionDirection,
            }
          : null;
      const target =
        focused && container.contains(focused)
          ? Array.from(
              clientContainer.querySelectorAll("input, select, button"),
            ).find((field) =>
              focusName
                ? field.getAttribute("name") === focusName
                : focused.tagName === "BUTTON" &&
                  field.tagName === "BUTTON" &&
                  field.textContent === focused.textContent,
            )
          : undefined;
      if (focused && container.contains(focused) && !target) {
        queueMicrotask(() => {
          root.unmount();
          roots.delete(container);
        });
        return;
      }
      container.replaceChildren(clientContainer);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      if (selection && target instanceof HTMLInputElement)
        target.setSelectionRange(
          selection.start,
          selection.end,
          selection.direction ?? undefined,
        );
    }, []);
    return <App {...props} initialDraft={draft} />;
  }

  root.render(<Ready />);
}

function readDraft(
  form: HTMLFormElement,
  config: FindAllArticlesConfig,
): ArticleDraft {
  const base = parseArticleQuery(
    new URLSearchParams(
      Object.entries(config)
        .filter(([, value]) => value != null)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const draft = toArticleDraft(base);
  const fields = new FormData(form);
  for (const key of ["since", "until", "limit"] as const) {
    const value = fields.get(key);
    if (typeof value === "string") draft[key] = value;
  }
  const field = fields.get("orderField");
  if (
    field === "createdAt" ||
    field === "likesCount" ||
    field === "stocksCount"
  )
    draft.orderField = field;
  const direction = fields.get("orderDirection");
  if (direction === "asc" || direction === "desc")
    draft.orderDirection = direction;
  return draft;
}
