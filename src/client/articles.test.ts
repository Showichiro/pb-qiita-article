// @vitest-environment jsdom
import type { ArticlesAppProps } from "./ArticlesApp";
import {
  articleQueryParams,
  defaultArticleQuery,
  parseArticleQuery,
  serializeArticleBootstrap,
} from "./articles";

describe("article query", () => {
  it("matches database ordering defaults", () =>
    expect(parseArticleQuery(new URLSearchParams())).toEqual(
      defaultArticleQuery,
    ));
  it("rejects invalid limits, offsets and ordering", () => {
    for (const input of [
      "limit=0&offset=-1",
      "limit=101&offset=1.5",
      "limit=&offset=Infinity",
      "limit=NaN&orderField=id&orderDirection=wrong",
    ])
      expect(parseArticleQuery(new URLSearchParams(input))).toEqual(
        defaultArticleQuery,
      );
  });
  it("round trips direct URL filters including non-page-aligned offsets", () => {
    const query = {
      ...defaultArticleQuery,
      since: "2026-01-01",
      until: "2026-10-01",
      orderField: "stocksCount" as const,
      orderDirection: "asc" as const,
      limit: 30,
      offset: 17,
    };
    expect(parseArticleQuery(articleQueryParams(query))).toEqual(query);
  });
  it("drops invalid dates", () =>
    expect(parseArticleQuery(new URLSearchParams("since=nonsense")).since).toBe(
      "",
    ));
  it("escapes script terminators and unicode separators without changing JSON values", () => {
    const value = {
      config: `u2089</script><script>&${String.fromCharCode(0x2028, 0x2029)}`,
      articles: [],
    };
    const encoded = serializeArticleBootstrap(value);
    expect(encoded).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(encoded)).toEqual(value);
  });
});

// React's server renderer exercises the island's first render without a browser.
describe("ArticlesApp initial render", () => {
  it("preserves columns, links, tags and the native search contract", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: ArticlesApp } = await import("./ArticlesApp");
    const html = renderToStaticMarkup(
      createElement<ArticlesAppProps>(ArticlesApp, {
        initialArticles: [
          {
            id: "a",
            title: "<記事>",
            userId: "writer",
            userName: "Author",
            createdAt: "2026-10-01T00:00:00.000Z",
            likesCount: 3,
            stocksCount: 4,
            tags: [{ name: "C#" }],
          },
        ],
      }),
    );
    expect(html).toContain("&lt;記事&gt;");
    expect(html).toContain("https://qiita.com/writer/items/a");
    expect(html).toContain("https://qiita.com/tags/C%23");
    expect(html).toContain("2026-10-01");
    for (const name of [
      "since",
      "until",
      "orderField",
      "orderDirection",
      "limit",
      "offset",
    ])
      expect(html).toContain(`name="${name}"`);
    for (const column of [
      "タイトル",
      "執筆者",
      "タグ",
      "いいね数",
      "ストック数",
      "投稿日",
    ])
      expect(html).toContain(column);
  });
  it("renders the empty result state", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: ArticlesApp } = await import("./ArticlesApp");
    expect(
      renderToStaticMarkup(
        createElement<ArticlesAppProps>(ArticlesApp, { initialArticles: [] }),
      ),
    ).toContain("該当する記事はありません。");
  });
});

describe("article requests", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("passes cancellation through to the existing API", async () => {
    const { fetchArticles } = await import("./articles");
    const request = vi
      .fn()
      .mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    await expect(
      fetchArticles(defaultArticleQuery, controller.signal),
    ).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/api/articles?"),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
  it("rejects HTTP failures and malformed payloads", async () => {
    const { fetchArticles } = await import("./articles");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("bad", { status: 500 }))
        .mockResolvedValueOnce(new Response('{"articles":[]}'))
        .mockResolvedValueOnce(new Response('[{"id":"a"}]')),
    );
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(
        fetchArticles(defaultArticleQuery, new AbortController().signal),
      ).rejects.toThrow();
  });
});

describe("ArticlesApp browser controls", () => {
  let host: HTMLDivElement;
  let root: import("react-dom/client").Root;
  const sample = {
    id: "a",
    title: "Article A",
    userId: "writer",
    userName: "Author",
    createdAt: "2026-10-01T00:00:00.000Z",
    likesCount: 3,
    stocksCount: 4,
    tags: [],
  };
  beforeEach(async () => {
    window.history.replaceState(
      null,
      "",
      "/articles?limit=1&offset=7&campaign=keep",
    );
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(host);
  });
  afterEach(async () => {
    const { act } = await import("react");
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/articles");
  });
  const mount = async () => {
    const { act, createElement } = await import("react");
    const { default: App } = await import("./ArticlesApp");
    await act(async () =>
      root.render(
        createElement<ArticlesAppProps>(App, { initialArticles: [sample] }),
      ),
    );
  };
  const action = async (selector: string, event = "click") => {
    const { act } = await import("react");
    const target = host.querySelector(selector);
    if (!target) throw new Error(`Missing ${selector}`);
    await act(async () => {
      target.dispatchEvent(
        new Event(event, { bubbles: true, cancelable: true }),
      );
    });
  };
  const change = async (selector: string, value: string) => {
    const { act } = await import("react");
    const target = host.querySelector(selector);
    if (!target) throw new Error(`Missing ${selector}`);
    await act(async () => {
      if (
        !(target instanceof HTMLSelectElement) &&
        !(target instanceof HTMLInputElement)
      )
        throw new Error(`Not an input control: ${selector}`);
      const prototype =
        target instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) throw new Error("Missing value setter");
      setter.call(target, value);
      target.dispatchEvent(
        new Event(target instanceof HTMLSelectElement ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  };
  it("uses SSR results without a request, respects URL pagination, and handles popstate", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([sample])));
    vi.stubGlobal("fetch", request);
    await mount();
    expect(request).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Article A");
    await action("nav button:last-child");
    expect(request.mock.calls[0][0]).toContain("offset=8");
    const { act } = await import("react");
    await act(async () => {
      window.history.replaceState(
        null,
        "",
        "/articles?limit=1&offset=2&orderField=likesCount",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(request.mock.lastCall?.[0]).toContain("offset=2");
    expect(request.mock.lastCall?.[0]).toContain("orderField=likesCount");
  });
  it("submits with offset reset, exposes loading/errors, and retries into empty results", async () => {
    let resolve!: (response: Response) => void;
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await mount();
    await action("form", "submit");
    expect(request.mock.calls[0][0]).toContain("offset=0");
    expect(host.textContent).toContain("読み込み中");
    expect(host.textContent).toContain("Article A");
    expect(host.querySelector("nav button")?.hasAttribute("disabled")).toBe(
      true,
    );
    expect(host.querySelector("form input")?.hasAttribute("disabled")).toBe(
      false,
    );
    const { act } = await import("react");
    await act(async () => resolve(new Response("failure", { status: 503 })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("503");
    await action('[role="alert"] button');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0]);
    expect(host.textContent).toContain("該当する記事はありません。");
  });
  it("keeps bootstrap rows paired with their query until the current URL resolves", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn(
      (_url: string) =>
        new Promise<Response>((done) => {
          finish = done;
        }),
    );
    vi.stubGlobal("fetch", request);
    const { act, createElement } = await import("react");
    const { default: App } = await import("./ArticlesApp");
    await act(async () =>
      root.render(
        createElement<ArticlesAppProps>(App, {
          initialConfig: { since: null, until: null, limit: 1, offset: 0 },
          initialArticles: [sample],
        }),
      ),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("offset=7");
    expect(host.querySelector("nav span")?.textContent).toBe("1");
    expect(host.textContent).toContain("Article A");
    await act(async () =>
      finish(
        new Response(JSON.stringify([{ ...sample, title: "Page eight" }])),
      ),
    );
    expect(host.querySelector("nav span")?.textContent).toBe("8");
    expect(host.textContent).toContain("Page eight");
    expect(host.textContent).not.toContain("Article A");
  });
  it("allows an empty limit draft and normalizes it only when submitted", async () => {
    const request = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await mount();
    const input = host.querySelector<HTMLInputElement>('[name="limit"]');
    if (!input) throw new Error("Missing limit");
    const { act } = await import("react");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!setter) throw new Error("Missing setter");
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("");
    expect(input.validity.rangeUnderflow).toBe(false);
    expect(host.querySelector("form")?.checkValidity()).toBe(true);
    expect(request).not.toHaveBeenCalled();
    await action("form", "submit");
    expect(request.mock.calls[0][0]).toContain("limit=10");
    expect(input.value).toBe("10");
  });
  it("uses Suspense for an unseeded first load without refetching on render", async () => {
    let resolve!: (response: Response) => void;
    const request = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", request);
    const { act, createElement } = await import("react");
    const { default: App } = await import("./ArticlesApp");
    await act(async () => root.render(createElement(App)));
    expect(host.textContent).toContain("読み込み中");
    await act(async () => root.render(createElement(App)));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve(new Response(JSON.stringify([sample]))));
    expect(host.textContent).toContain("Article A");
  });
  it("keeps one pending Promise through rerenders and cancels on unmount", async () => {
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await action("form", "submit");
    const { act, createElement } = await import("react");
    const { default: App } = await import("./ArticlesApp");
    await act(async () =>
      root.render(
        createElement<ArticlesAppProps>(App, { initialArticles: [sample] }),
      ),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Article A");
    await act(async () => root.unmount());
    expect((request.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("applies date and select filters immediately using the complete draft and offset zero", async () => {
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="since"]', "2026-02-03");
    await change('[name="orderField"]', "likesCount");
    expect(request).toHaveBeenCalledTimes(2);
    expect((request.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    const url = new URL(request.mock.calls[1][0], window.location.origin);
    expect(url.searchParams.get("since")).toBe("2026-02-03");
    expect(url.searchParams.get("orderField")).toBe("likesCount");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(window.location.search).toContain("since=2026-02-03");
    expect(window.location.search).toContain("orderField=likesCount");
    expect(window.location.search).toContain("offset=0");
  });
  it("waits for 500ms of quiet and uses the latest draft after an urgent rerender", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    await vi.advanceTimersByTimeAsync(300);
    await change('[name="limit"]', "3");
    await vi.advanceTimersByTimeAsync(499);
    expect(request).not.toHaveBeenCalled();
    const { act, createElement } = await import("react");
    const { default: App } = await import("./ArticlesApp");
    await act(async () =>
      root.render(
        createElement<ArticlesAppProps>(App, { initialArticles: [sample] }),
      ),
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    const url = new URL(request.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(window.location.search).toContain("limit=3");
    expect(host.querySelector<HTMLInputElement>('[name="limit"]')?.value).toBe(
      "3",
    );
  });
  it("replaces a pending limit search with a newer value and keeps current rows visible", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    expect(host.textContent).toContain("読み込み中");
    expect(host.textContent).toContain("Article A");
    await vi.advanceTimersByTimeAsync(250);
    await change('[name="limit"]', "3");
    expect(host.textContent).toContain("Article A");
    await vi.advanceTimersByTimeAsync(499);
    expect(request).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Article A");
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("limit=3");
    expect(host.textContent).toContain("Article A");
  });
  it("includes a pending numeric draft in an immediate select search", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    await change('[name="orderField"]', "stocksCount");
    expect(request).toHaveBeenCalledTimes(1);
    const url = new URL(request.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("orderField")).toBe("stocksCount");
    expect(url.searchParams.get("offset")).toBe("0");
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("submits a pending limit once and deduplicates the same canonical query", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([sample])));
    vi.stubGlobal("fetch", request);
    await mount();
    const historyLengthBeforeSearch = window.history.length;
    await change('[name="limit"]', "3");
    await action("form", "submit");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("limit=3");
    expect(request.mock.calls[0][0]).toContain("offset=0");
    expect(window.history.length).toBe(historyLengthBeforeSearch + 1);
    expect(window.location.search).toContain("campaign=keep");
    const historyLengthAfterSearch = window.history.length;
    await action("form", "submit");
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBe(historyLengthAfterSearch);
    vi.useRealTimers();
    const { act } = await import("react");
    await act(async () => {
      const popstate = new Promise<void>((resolve) =>
        window.addEventListener("popstate", () => resolve(), { once: true }),
      );
      window.history.back();
      await popstate;
    });
    expect(window.location.search).toContain("limit=1");
    expect(window.location.search).toContain("offset=7");
  });
  it("cancels a pending debounce on history navigation and restores draft from the URL", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    const { act } = await import("react");
    await act(async () => {
      window.history.replaceState(
        null,
        "",
        "/articles?since=2026-03-04&orderField=stocksCount&limit=4&offset=13&campaign=history",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(request).toHaveBeenCalledTimes(1);
    const requested = new URL(request.mock.calls[0][0], window.location.origin);
    expect(requested.searchParams.get("since")).toBe("2026-03-04");
    expect(requested.searchParams.get("orderField")).toBe("stocksCount");
    expect(requested.searchParams.get("limit")).toBe("4");
    expect(requested.searchParams.get("offset")).toBe("13");
    expect(window.location.search).toContain("campaign=history");
    expect(host.querySelector<HTMLInputElement>('[name="since"]')?.value).toBe(
      "2026-03-04",
    );
    const orderField = host.querySelector('[name="orderField"]');
    if (!(orderField instanceof HTMLSelectElement))
      throw new Error("Missing order field select");
    expect(orderField.value).toBe("stocksCount");
    expect(host.querySelector<HTMLInputElement>('[name="limit"]')?.value).toBe(
      "4",
    );
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("cancels a pending debounce when unmounted before it can start a request", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    await vi.advanceTimersByTimeAsync(250);
    const { act } = await import("react");
    await act(async () => root.unmount());
    await vi.advanceTimersByTimeAsync(500);
    expect(request).not.toHaveBeenCalled();
  });
  it("aborts stale requests and prevents old responses replacing current results", async () => {
    const pending: Array<{
      resolve: (response: Response) => void;
      reject: (error: Error) => void;
    }> = [];
    const request = vi.fn(
      (_url: string, _options: RequestInit) =>
        new Promise<Response>((resolve, reject) =>
          pending.push({ resolve, reject }),
        ),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="orderField"]', "likesCount");
    await change('[name="orderDirection"]', "asc");
    expect(request).toHaveBeenCalledTimes(2);
    expect((request.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    const { act } = await import("react");
    await act(async () =>
      pending[0].reject(new DOMException("Aborted", "AbortError")),
    );
    await act(async () =>
      pending[1].resolve(
        new Response(JSON.stringify([{ ...sample, title: "Latest article" }])),
      ),
    );
    expect(host.textContent).toContain("Latest article");
    expect(host.textContent).not.toContain("Article A");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain("読み込み中");
  });
  it("keeps invalid numeric drafts editable and does not search until the full draft is valid", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "101");
    await change('[name="since"]', "2026-04-05");
    await change('[name="orderField"]', "stocksCount");
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toContain("limit=1");
    expect(window.location.search).not.toContain("since=2026-04-05");
    expect(window.location.search).not.toContain("orderField=stocksCount");
    expect(host.querySelector<HTMLInputElement>('[name="limit"]')?.value).toBe(
      "101",
    );
    expect(host.querySelector<HTMLInputElement>('[name="since"]')?.value).toBe(
      "2026-04-05",
    );
    const orderField = host.querySelector('[name="orderField"]');
    if (!(orderField instanceof HTMLSelectElement))
      throw new Error("Missing order field select");
    expect(orderField.value).toBe("stocksCount");

    await change('[name="limit"]', "2");
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
    const url = new URL(request.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("since")).toBe("2026-04-05");
    expect(url.searchParams.get("orderField")).toBe("stocksCount");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(window.location.search).toContain("campaign=keep");
  });
  it("retries a failed same-query submit without adding a duplicate history entry", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response("failure", { status: 503 }))
      .mockResolvedValueOnce(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await mount();
    await action("form", "submit");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("503");
    const historyLengthAfterFailure = window.history.length;
    await action("form", "submit");
    expect(request).toHaveBeenCalledTimes(2);
    expect(window.history.length).toBe(historyLengthAfterFailure);
    expect(host.textContent).toContain("該当する記事はありません。");
  });
});
