// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { resetTestQueries } from "./test-query-client";
beforeEach(resetTestQueries);
import AnalysisApp from "./AnalysisApp";
import { analysisBucketStarts, type AnalysisBootstrap } from "./analysis";
import { mountAnalysisApp, readAnalysisInitialData } from "./analysis-mount";

const bootstrap: AnalysisBootstrap = {
  state: {
    since: "2026-01-01",
    until: "2026-01-01",
    bucket: "day",
    author: "",
    tags: [],
    metric: "posts",
    view: "table",
  },
  rows: [
    {
      bucketStart: "2026-01-01",
      articleCount: 2,
      publishedArticleLikes: 4,
    },
  ],
  tagOptions: ["known"],
  dataVersion: "v1",
};

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ${id}`);
  return element;
}

function selectField(name: string): HTMLSelectElement {
  const element = document.querySelector(`[name="${name}"]`);
  if (!(element instanceof HTMLSelectElement))
    throw new Error(`Missing ${name} select`);
  return element;
}

function island(data = bootstrap) {
  document.body.innerHTML = `
    <div id="analysis-app">
      <form action="/analysis" method="get">
        <input name="since" type="date" value="2026-01-01">
        <input name="until" type="date" value="2026-01-01">
        <input name="author" value="">
        <select name="bucket"><option value="day" selected>日</option></select>
        <select name="tags" multiple><option value="known">known</option></select>
        <select name="metric"><option value="posts" ${data.state.metric === "posts" ? "selected" : ""}>記事数</option><option value="likes" ${data.state.metric === "likes" ? "selected" : ""}>いいね数</option></select>
        <select name="view"><option value="table" ${data.state.view === "table" ? "selected" : ""}>表</option><option value="chart" ${data.state.view === "chart" ? "selected" : ""}>グラフ</option></select>
      </form>
    </div>
    <script id="analysis-bootstrap" type="application/json"></script>`;
  byId("analysis-bootstrap").textContent = JSON.stringify(data);
  return byId("analysis-app");
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.show = function () { this.open = true; };
});

test("reads and validates the SSR bootstrap", () => {
  island();
  expect(readAnalysisInitialData(byId("analysis-app"))).toEqual(bootstrap);
  byId("analysis-bootstrap").textContent = "{";
  expect(() => readAnalysisInitialData(byId("analysis-app"))).toThrow();
});

test("leaves SSR intact during delayed download and hands off current draft and focus", async () => {
  const container = island({
    ...bootstrap,
    state: { ...bootstrap.state, metric: "likes", view: "chart" },
  });
  let finish!: (module: { default: typeof AnalysisApp }) => void;
  const mounting = mountAnalysisApp(
    container,
    () => new Promise((resolve) => (finish = resolve)),
  );
  expect(container.querySelector("form")).not.toBeNull();
  const author = container.querySelector<HTMLInputElement>('[name="author"]');
  if (!author) throw new Error("Missing author");
  author.value = "Writer";
  author.dispatchEvent(new Event("input", { bubbles: true }));
  const metric = selectField("metric");
  const view = selectField("view");
  metric.value = "posts";
  metric.dispatchEvent(new Event("change", { bubbles: true }));
  view.value = "table";
  view.dispatchEvent(new Event("change", { bubbles: true }));
  author.focus();
  author.setSelectionRange(2, 4);
  await act(async () => {
    finish({ default: AnalysisApp });
    await mounting;
  });
  const clientAuthor =
    container.querySelector<HTMLInputElement>('[name="author"]');
  expect(clientAuthor?.value).toBe("Writer");
  expect(document.activeElement).toBe(clientAuthor);
  expect(clientAuthor?.selectionStart).toBe(2);
  expect(clientAuthor?.selectionEnd).toBe(4);
  expect(selectField("metric").value).toBe("posts");
  expect(selectField("view").value).toBe("table");
  expect(container.querySelector("tbody tr")?.textContent).toContain("4");
});

test("hands off a focused native submit button to the automatic-search hint", async () => {
  const container = island();
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing native form");
  form.insertAdjacentHTML(
    "beforeend",
    '<div class="flex h-9 w-28 items-center"><button type="submit" data-focus-id="analysis-auto-search">適用</button></div>',
  );
  const nativeButton = form.querySelector("button");
  if (!nativeButton) throw new Error("Missing native submit button");
  nativeButton.focus();

  let finish!: (module: { default: typeof AnalysisApp }) => void;
  const mounting = mountAnalysisApp(
    container,
    () => new Promise((resolve) => (finish = resolve)),
  );
  await act(async () => {
    finish({ default: AnalysisApp });
    await mounting;
  });
  const hint = container.querySelector<HTMLElement>(
    "[data-focus-id='analysis-auto-search']",
  );
  expect(hint?.tagName).toBe("FORM");
  expect(hint?.getAttribute("tabindex")).toBe("-1");
  expect(document.activeElement).toBe(hint);
  expect(container.querySelector("button[type='submit']")).toBeNull();
});

test("retains the native GET form when app download or bootstrap parsing fails", async () => {
  const container = island();
  await expect(
    mountAnalysisApp(container, async () => {
      throw new Error("download failed");
    }),
  ).rejects.toThrow("download failed");
  expect(container.querySelector('form[method="get"]')).not.toBeNull();

  byId("analysis-bootstrap").textContent = "{";
  const load = vi.fn();
  await expect(mountAnalysisApp(container, load)).rejects.toThrow();
  expect(load).not.toHaveBeenCalled();
  expect(container.querySelector('form[method="get"]')).not.toBeNull();
});

test("bootstrap rows are zero-filled and date bucket lengths match the contract", () => {
  expect(
    analysisBucketStarts(
      bootstrap.state.since,
      bootstrap.state.until,
      bootstrap.state.bucket,
    ),
  ).toEqual(["2026-01-01"]);
});
