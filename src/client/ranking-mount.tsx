/** @jsxImportSource react */
import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import { Suspense, useLayoutEffect, type ComponentType } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import {
  parseRankingQuery,
  configQueryParams,
  isLikesCountRows,
  isPostCountRows,
  isRankingQuery,
  toRankingDraft,
  type RankingDraft,
  type RankingQuery,
} from "./ranking";
import {
  normalizeRankingQuery,
  rankingLikesQueryKey,
  rankingPostsQueryKey,
} from "./queries";
import { QueryProvider, seedQueryData } from "./query-client";
import { QueryErrorBoundary } from "./query-error-boundary";

export type RankingInitialData = {
  initialConfig: RankingQuery;
  initialPostCounts: ArticleCountGroupByUser[];
  initialLikesCounts: LikesCountSchema[];
  initialDataVersion: string;
};

type AppModule = {
  default: ComponentType<RankingInitialData & { initialDraft?: RankingDraft }>;
};
const roots = new WeakMap<HTMLElement, Root>();

export function readInitialData(container: HTMLElement): RankingInitialData {
  const bootstrap = container.ownerDocument.getElementById("ranking-bootstrap");
  const data: unknown = bootstrap?.textContent
    ? JSON.parse(bootstrap.textContent)
    : undefined;
  const configAttribute = container.dataset.initialConfig;
  if (data === undefined && !configAttribute)
    throw new Error("Missing ranking initial configuration");
  const initialConfig: unknown =
    data !== undefined
      ? isRecord(data)
        ? data.config
        : undefined
      : JSON.parse(configAttribute ?? "null");
  if (!isRankingQuery(initialConfig)) {
    throw new Error("Invalid ranking initial configuration");
  }
  const initialDataVersion: unknown = isRecord(data)
    ? data.dataVersion
    : container.dataset.dataVersion;
  if (typeof initialDataVersion !== "string" || initialDataVersion.length === 0)
    throw new Error("Invalid ranking data version");
  const postCountsAttribute = container.dataset.initialPostCounts;
  const postCounts =
    data !== undefined
      ? isRecord(data)
        ? data.postCounts
        : undefined
      : postCountsAttribute
        ? JSON.parse(postCountsAttribute)
        : undefined;
  if (!isPostCountRows(postCounts)) {
    throw new Error("Invalid ranking post counts initial data");
  }
  const likesCountsAttribute = container.dataset.initialLikesCounts;
  const likesCounts =
    data !== undefined
      ? isRecord(data)
        ? data.likesCounts
        : undefined
      : likesCountsAttribute
        ? JSON.parse(likesCountsAttribute)
        : undefined;
  if (!isLikesCountRows(likesCounts)) {
    throw new Error("Invalid ranking likes counts initial data");
  }
  return {
    initialConfig,
    initialPostCounts: postCounts,
    initialLikesCounts: likesCounts,
    initialDataVersion,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function mountRankingApp(
  container: HTMLElement,
  loadApp: () => Promise<AppModule> = () => import("./RankingApp"),
): Promise<void> {
  if (roots.has(container)) return;
  const props = readInitialData(container);
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
  const requestQuery = normalizeRankingQuery(props.initialConfig);
  seedQueryData(rankingPostsQueryKey(props.initialDataVersion, requestQuery), {
    query: requestQuery,
    rows: props.initialPostCounts,
  });
  seedQueryData(rankingLikesQueryKey(props.initialDataVersion, requestQuery), {
    query: requestQuery,
    rows: props.initialLikesCounts,
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
      console.error("Could not render the ranking application", error);
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
      const focusAction =
        focused instanceof HTMLElement &&
        focused.hasAttribute("data-ranking-action");
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
                "input, select, button, [data-ranking-action]",
              ),
            ).find((field) =>
              focusName
                ? field.getAttribute("name") === focusName
                : focusAction && field.hasAttribute("data-ranking-action"),
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
      if (target instanceof HTMLElement) {
        const disclosure = target.closest("details");
        if (disclosure) disclosure.open = true;
        target.focus({ preventScroll: true });
      }
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
            fallbackMessage="ランキングを取得できませんでした"
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

export function readDraft(
  form: HTMLFormElement,
  config: RankingQuery,
): RankingDraft {
  const base = parseRankingQuery(configQueryParams(config));
  const draft = toRankingDraft(base);
  const fields = new FormData(form);
  for (const key of ["since", "until"] as const) {
    const value = fields.get(key);
    if (typeof value === "string") draft[key] = value;
  }
  return draft;
}
