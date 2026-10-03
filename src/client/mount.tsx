/** @jsxImportSource react */
import type { FindAllArticlesConfig } from "@/db/findAllArticles";
import type { Article } from "@/schemas";
import { Suspense, useLayoutEffect, type ComponentType } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import {
  parseArticleQuery,
  configQueryParams,
  rangeFields,
  toArticleDraft,
  type ArticleDraft,
} from "./articles";
import { articlesQueryKey, normalizeArticleQuery } from "./queries";
import { QueryProvider, seedQueryData } from "./query-client";
import { QueryErrorBoundary } from "./query-error-boundary";

export type ArticlesInitialData = {
  initialConfig: FindAllArticlesConfig;
  initialArticles: Article[];
  initialTagOptions?: string[];
  initialDataVersion: string;
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
  const initialArticles: unknown = data
    ? data.articles
    : articles
      ? JSON.parse(articles)
      : undefined;
  if (!Array.isArray(initialArticles)) {
    throw new Error("Invalid articles initial data");
  }
  const initialDataVersion: unknown =
    data?.dataVersion ?? container.dataset.dataVersion;
  if (typeof initialDataVersion !== "string" || initialDataVersion.length === 0)
    throw new Error("Invalid articles data version");
  const initialTagOptions: unknown = data?.tagOptions;
  if (
    initialTagOptions !== undefined &&
    (!Array.isArray(initialTagOptions) ||
      !initialTagOptions.every((tag) => typeof tag === "string"))
  )
    throw new Error("Invalid article tag options");
  return {
    initialConfig,
    initialArticles,
    initialDataVersion,
    ...(initialTagOptions === undefined
      ? {}
      : { initialTagOptions: initialTagOptions as string[] }),
  };
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
  const query = parseArticleQuery(configQueryParams(props.initialConfig));
  const normalizedQuery = normalizeArticleQuery(query);
  seedQueryData(articlesQueryKey(props.initialDataVersion, normalizedQuery), {
    query: normalizedQuery,
    rows: props.initialArticles,
  });
  const clientContainer = document.createElement("div");
  const fallback = Array.from(container.childNodes);
  const root = createRoot(clientContainer, {
    onCaughtError() {
      if (clientContainer.parentNode !== container) {
        stopTracking();
        roots.delete(container);
        queueMicrotask(() => root.unmount());
      }
    },
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
      const focusId =
        focused && container.contains(focused)
          ? focused.getAttribute("data-focus-id")
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
              clientContainer.querySelectorAll(
                "input, select, button, a, [data-focus-id]",
              ),
            ).find((field) =>
              focusName
                ? field.getAttribute("name") === focusName
                : focusId
                  ? field.getAttribute("data-focus-id") === focusId
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

  root.render(
    <QueryProvider>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <QueryErrorBoundary
            onReset={reset}
            fallbackMessage="記事を取得できませんでした"
          >
            <Suspense fallback={<p role="status">読み込み中…</p>}>
              <Ready />
            </Suspense>
          </QueryErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </QueryProvider>,
  );
}

function readDraft(
  form: HTMLFormElement,
  config: FindAllArticlesConfig,
): ArticleDraft {
  const base = parseArticleQuery(configQueryParams(config));
  const draft = toArticleDraft(base);
  const fields = new FormData(form);
  for (const key of [
    "q",
    "author",
    "since",
    "until",
    "limit",
    ...rangeFields,
  ] as const) {
    const value = fields.get(key);
    if (typeof value === "string") draft[key] = value;
  }
  if (form.querySelector('[name="tags"]'))
    draft.tags = fields
      .getAll("tags")
      .filter((value): value is string => typeof value === "string");
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
