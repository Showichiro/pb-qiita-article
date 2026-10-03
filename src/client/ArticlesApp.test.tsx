// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ArticlesApp, { type ArticlesAppProps } from "./ArticlesApp";
import { QueryProvider, getQueryClient, seedQueryData } from "./query-client";
import { articlesQueryKey } from "./queries";
import { articleQueryParams, defaultArticleQuery, type ArticleQuery } from "./articles";

const rows = [{ id: "a", title: "Original article", userId: "writer", userName: "Writer", createdAt: "2026-01-01", likesCount: 1, stocksCount: 2, tags: [{ name: "test" }] }];
let host: HTMLDivElement;
let root: Root | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
let latestVersion: string;
let metadataError: Error | undefined;
let resultRequest: (url: string, init: RequestInit) => Promise<Response>;
const resultResponse = (body: unknown, version = "v1", status = 200) => new Response(JSON.stringify(body), { status, headers: { "X-Data-Version": version } });

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
beforeEach(() => {
  getQueryClient().clear();
  window.history.replaceState(null, "", "/articles");
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
  latestVersion = "v1"; metadataError = undefined;
  resultRequest = async () => resultResponse(rows);
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url === "/api/data-version") {
      if (metadataError) throw metadataError;
      return resultResponse({ dataVersion: latestVersion }, latestVersion);
    }
    return resultRequest(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined;
  host.remove(); getQueryClient().clear(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const resultCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/articles?"));
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function mount(query: ArticleQuery = defaultArticleQuery) {
  window.history.replaceState(null, "", "/articles?" + articleQueryParams(query));
  seedQueryData(articlesQueryKey("v1", query), { query, rows });
  await act(async () => root?.render(<QueryProvider><ArticlesApp initialConfig={query} initialArticles={rows} initialDataVersion="v1" initialTagOptions={["test"]} /></QueryProvider>));
  await settle();
}
async function click(selector: string) {
  const element = host.querySelector<HTMLElement>(selector); if (!element) throw new Error("Missing " + selector);
  await act(async () => element.click()); await settle();
}
async function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('[name="q"]'); if (!input) throw new Error("Missing keyword");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await settle();
}

it("checks metadata at startup without repeating the SSR result request", async () => {
  await mount(); expect(fetchMock).toHaveBeenCalledTimes(1); expect(resultCalls()).toHaveLength(0); expect(host.textContent).toContain("Original article");
});
it("reuses the cache when history returns to the same normalized query", async () => {
  await mount(); await act(async () => window.dispatchEvent(new PopStateEvent("popstate"))); await settle();
  expect(resultCalls()).toHaveLength(0); expect(host.textContent).toContain("Original article");
});
it("allows an obsolete response to finish under its own key without replacing the current result", async () => {
  const pending = new Map<string, (response: Response) => void>();
  resultRequest = (url) => new Promise(resolve => pending.set(new URL(url, window.location.origin).searchParams.get("q") ?? "", resolve));
  await mount(); await search("old"); await search("new");
  await act(async () => pending.get("new")?.(resultResponse([{ ...rows[0], title: "Current result" }]))); await settle();
  await act(async () => pending.get("old")?.(resultResponse([{ ...rows[0], title: "Obsolete result" }]))); await settle();
  expect(host.textContent).toContain("Current result"); expect(host.textContent).not.toContain("Obsolete result"); expect(window.location.search).toContain("q=new"); expect(resultCalls()).toHaveLength(2);
});
it("announces a new generation without replacing rows, then updates at offset zero", async () => {
  latestVersion = "v2"; resultRequest = async () => resultResponse([{ ...rows[0], title: "New generation" }], "v2");
  await mount({ ...defaultArticleQuery, offset: 10 });
  expect(host.textContent).toContain("新しいデータがあります"); expect(host.textContent).toContain("Original article"); expect(resultCalls()).toHaveLength(0);
  await click('[data-version-action="refresh"]');
  expect(resultCalls()).toHaveLength(1); expect(resultCalls()[0][0]).toContain("offset=0"); expect(resultCalls()[0][1].headers).toMatchObject({ "X-Expected-Data-Version": "v2" });
  expect(host.textContent).toContain("New generation"); expect(host.textContent).not.toContain("Original article");
  expect(getQueryClient().getQueryData(articlesQueryKey("v1", { ...defaultArticleQuery, offset: 10 }))).toBeUndefined();
});
it("does not store a mismatched-generation response under an old key and keeps visible rows", async () => {
  resultRequest = async () => resultResponse([{ ...rows[0], title: "Wrong generation" }], "v2", 409);
  await mount(); await search("mismatch");
  expect(host.textContent).toContain("Original article"); expect(host.textContent).not.toContain("Wrong generation"); expect(host.textContent).toContain("新しいデータがあります");
  expect(getQueryClient().getQueryData(articlesQueryKey("v1", { ...defaultArticleQuery, q: "mismatch" }))).toBeUndefined();
});
it("explicitly refetches even when the generation is unchanged", async () => {
  resultRequest = async () => resultResponse([{ ...rows[0], title: "Refetched result" }]);
  await mount(); await click('[data-version-action="refresh"]');
  expect(resultCalls()).toHaveLength(1); expect(host.textContent).toContain("Refetched result");
});
it("retains rows when metadata fails and can retry metadata independently", async () => {
  metadataError = new Error("Metadata unavailable"); await mount();
  expect(host.textContent).toContain("Original article"); expect(host.textContent).toContain("Metadata unavailable");
  metadataError = undefined; latestVersion = "v2"; await click('[data-version-action="check"]');
  expect(host.textContent).toContain("Original article"); expect(host.textContent).toContain("新しいデータがあります"); expect(resultCalls()).toHaveLength(0);
});
it("clears selected tags immediately while preserving the other filters", async () => {
  await mount({ ...defaultArticleQuery, q: "keyword", tags: ["test"] }); await click('[data-focus-id="articles-tag-clear"]');
  expect(resultCalls()).toHaveLength(1); const params = new URLSearchParams(window.location.search); expect(params.get("q")).toBe("keyword"); expect(params.getAll("tags")).toEqual([]);
});
it("does not submit an Enter key while tracked IME composition is active", async () => {
  await mount(); const input = host.querySelector<HTMLInputElement>('[name="q"]')!;
  await act(async () => { input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: false })); });
  expect(resultCalls()).toHaveLength(0);
});
it("cancels debounce work when the island unmounts", async () => {
  await mount(); vi.useFakeTimers(); const input = host.querySelector<HTMLInputElement>('[name="q"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "pending"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { root?.unmount(); root = undefined; await vi.advanceTimersByTimeAsync(600); }); expect(resultCalls()).toHaveLength(0);
});
