/** @jsxImportSource react */
import { Suspense, useLayoutEffect, type ComponentType } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import {
  analysisDraftError,
  validateAnalysisResponse,
  type AnalysisBootstrap,
  type AnalysisDraft,
  type AnalysisMetric,
  type AnalysisView,
} from "./analysis";
import { analysisQueryKey, normalizeAnalysisQuery } from "./queries";
import { QueryProvider, seedQueryData } from "./query-client";
import { QueryErrorBoundary } from "./query-error-boundary";

type AppProps = {
  initialData: AnalysisBootstrap;
  initialDraft?: AnalysisDraft;
  initialMetric?: AnalysisMetric;
  initialView?: AnalysisView;
};

type AppModule = { default: ComponentType<AppProps> };
const roots = new WeakMap<HTMLElement, Root>();

export function readAnalysisInitialData(
  container: HTMLElement,
): AnalysisBootstrap {
  const element = container.ownerDocument.getElementById("analysis-bootstrap");
  if (!element?.textContent) throw new Error("Missing analysis initial data");
  const value: unknown = JSON.parse(element.textContent);
  if (!value || typeof value !== "object")
    throw new Error("Invalid analysis initial data");
  const data = value as Record<string, unknown>;
  const state = data.state;
  if (!state || typeof state !== "object")
    throw new Error("Invalid analysis initial configuration");
  const candidate = state as Record<string, unknown>;
  if (
    (candidate.metric !== "posts" && candidate.metric !== "likes") ||
    (candidate.view !== "table" && candidate.view !== "chart") ||
    typeof candidate.since !== "string" ||
    typeof candidate.until !== "string" ||
    (candidate.bucket !== "day" &&
      candidate.bucket !== "week" &&
      candidate.bucket !== "month") ||
    typeof candidate.author !== "string" ||
    !Array.isArray(candidate.tags) ||
    !candidate.tags.every((tag) => typeof tag === "string")
  )
    throw new Error("Invalid analysis initial configuration");
  const query: AnalysisBootstrap["state"] = {
    since: candidate.since,
    until: candidate.until,
    bucket: candidate.bucket,
    author: candidate.author,
    tags: candidate.tags,
    metric: candidate.metric,
    view: candidate.view,
  };
  if (
    analysisDraftError({
      since: query.since,
      until: query.until,
      bucket: query.bucket,
      author: query.author,
      tags: query.tags,
    })
  )
    throw new Error("Invalid analysis initial configuration");
  if (
    !Array.isArray(data.tagOptions) ||
    !data.tagOptions.every(
      (tag: unknown): tag is string => typeof tag === "string",
    )
  )
    throw new Error("Invalid analysis tag options");
  if (typeof data.dataVersion !== "string" || data.dataVersion.length === 0)
    throw new Error("Invalid analysis data version");
  const rows = validateAnalysisResponse(
    {
      since: query.since,
      until: query.until,
      bucket: query.bucket,
      rows: data.rows,
    },
    query,
  );
  return {
    dataVersion: data.dataVersion,
    state: query,
    rows,
    tagOptions: data.tagOptions,
  };
}

export async function mountAnalysisApp(
  container: HTMLElement,
  loadApp: () => Promise<AppModule> = () => import("./AnalysisApp"),
): Promise<void> {
  if (roots.has(container)) return;
  const initialData = readAnalysisInitialData(container);
  let editVersion = 0;
  const edited = () => {
    editVersion++;
  };
  const stopTracking = () => {
    container.removeEventListener("input", edited, true);
    container.removeEventListener("change", edited, true);
  };
  container.addEventListener("input", edited, true);
  container.addEventListener("change", edited, true);

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
  const query = normalizeAnalysisQuery({
    since: initialData.state.since,
    until: initialData.state.until,
    bucket: initialData.state.bucket,
    author: initialData.state.author,
    tags: initialData.state.tags,
  });
  seedQueryData(analysisQueryKey(initialData.dataVersion, query), {
    query,
    rows: initialData.rows,
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
      console.error("Could not render the analysis application", error);
      container.replaceChildren(...fallback);
      roots.delete(container);
    },
  });
  roots.set(container, root);
  const version = editVersion;
  const form = container.querySelector("form");
  const initial = form ? readFormState(form, initialData) : undefined;

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
    return (
      <App
        initialData={initialData}
        initialDraft={initial?.draft}
        initialMetric={initial?.metric}
        initialView={initial?.view}
      />
    );
  }

  root.render(
    <QueryProvider>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <QueryErrorBoundary
            onReset={reset}
            fallbackMessage="時系列データを取得できませんでした"
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

function readFormState(
  form: HTMLFormElement,
  initialData: AnalysisBootstrap,
): {
  draft: AnalysisDraft;
  metric: AnalysisMetric;
  view: AnalysisView;
} {
  const fields = new FormData(form);
  const draft: AnalysisDraft = {
    since: String(fields.get("since") ?? initialData.state.since),
    until: String(fields.get("until") ?? initialData.state.until),
    bucket: String(fields.get("bucket") ?? initialData.state.bucket),
    author: String(fields.get("author") ?? initialData.state.author),
    tags: fields
      .getAll("tags")
      .filter((value): value is string => typeof value === "string"),
  };
  if (!form.querySelector('[name="tags"]'))
    draft.tags = [...initialData.state.tags];
  const metric = fields.get("metric");
  const view = fields.get("view");
  return {
    draft,
    metric:
      metric === "likes" || metric === "posts"
        ? metric
        : initialData.state.metric,
    view: view === "chart" || view === "table" ? view : initialData.state.view,
  };
}
