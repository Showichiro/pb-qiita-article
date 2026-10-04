// @vitest-environment jsdom
import type { ArticlesAppProps } from "./ArticlesApp";
import { articleTestElement, resetTestQueries } from "./test-query-client";
beforeEach(resetTestQueries);
import {
  articleQueryParams,
  configQueryParams,
  commitArticleDraft,
  toArticleDraft,
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
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(
      articleTestElement({
        initialDataVersion: "v1",
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
    const { renderToStaticMarkup } = await import("react-dom/server");
    expect(
      renderToStaticMarkup(
        articleTestElement({
          initialDataVersion: "v1",
          initialArticles: [],
        }),
      ),
    ).toContain("該当する記事はありません。");
  });
});

describe("article requests", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("passes expected version header and validates response", async () => {
    const { fetchArticles } = await import("./articles");
    const request = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: new Headers({ "X-Data-Version": "v1" }),
      }),
    );
    vi.stubGlobal("fetch", request);
    await expect(fetchArticles(defaultArticleQuery, "v1")).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/api/articles?"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Expected-Data-Version": "v1",
        }),
      }),
    );
  });
  it("rejects HTTP failures and malformed payloads", async () => {
    const { fetchArticles } = await import("./articles");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("bad", { status: 500, headers: new Headers() }),
        )
        .mockResolvedValueOnce(
          new Response('{"articles":[]}', {
            status: 200,
            headers: new Headers({ "X-Data-Version": "v1" }),
          }),
        )
        .mockResolvedValueOnce(
          new Response('[{"id":"a"}]', {
            status: 200,
            headers: new Headers({ "X-Data-Version": "v1" }),
          }),
        ),
    );
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(fetchArticles(defaultArticleQuery, "v1")).rejects.toThrow();
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
  const mount = async (props: Partial<ArticlesAppProps> = {}) => {
    const { act } = await import("react");
    await act(async () =>
      root.render(
        articleTestElement({
          initialDataVersion: "v1",
          initialArticles: [sample],
          ...props,
        }),
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
      .mockResolvedValue(
        new Response(JSON.stringify([sample]), {
          headers: { "X-Data-Version": "v1" },
        }),
      );
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
      .mockResolvedValueOnce(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
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
    await act(async () =>
      resolve(
        new Response("failure", {
          headers: { "X-Data-Version": "v1" },
          status: 503,
        }),
      ),
    );
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
    const { act } = await import("react");
    await act(async () =>
      root.render(
        articleTestElement({
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
        new Response(JSON.stringify([{ ...sample, title: "Page eight" }]), {
          headers: { "X-Data-Version": "v1" },
        }),
      ),
    );
    expect(host.querySelector("nav span")?.textContent).toBe("8");
    expect(host.textContent).toContain("Page eight");
    expect(host.textContent).not.toContain("Article A");
  });
  it("allows an empty limit draft and normalizes it only when submitted", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
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
  it("starts one stable event-owned request from a seeded empty bootstrap", async () => {
    let resolve!: (response: Response) => void;
    const request = vi.fn(
      (_url: string, _options: RequestInit) =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", request);
    await mount({ initialArticles: [] });
    expect(host.textContent).toContain("該当する記事はありません。");
    expect(request).not.toHaveBeenCalled();
    await change('[name="q"]', "event-owned");
    await action("form", "submit");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("q=event-owned");
    expect(host.textContent).toContain("読み込み中");
    const { act } = await import("react");
    await act(async () =>
      root.render(articleTestElement({ initialArticles: [] })),
    );
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve(
        new Response(JSON.stringify([sample]), {
          headers: { "X-Data-Version": "v1" },
        }),
      ),
    );
    expect(host.textContent).toContain("Article A");
  });
  it("coalesces a pending query through rerenders and ignores its completion after unmount", async () => {
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await action("form", "submit");
    const { act } = await import("react");
    await act(async () =>
      root.render(articleTestElement({ initialArticles: [sample] })),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Article A");
    await act(async () => root.unmount());
    expect(request.mock.calls[0][1].headers).toMatchObject({
      "X-Expected-Data-Version": "v1",
    });
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(request).toHaveBeenCalledTimes(1);
  });
  const input = async (name: string, value: string) => {
    const target = host.querySelector<HTMLInputElement>(
      `input[name="${name}"]`,
    );
    if (!target) throw new Error("Missing input");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) throw new Error("Missing setter");
    const { act } = await import("react");
    await act(async () => {
      setter.call(target, value);
      target.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return target;
  };
  it("rejects inverted ranges before history or requests change", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    await input("minLikes", "20");
    await input("maxLikes", "10");
    const url = window.location.href;
    await action("form", "submit");
    expect(request).not.toHaveBeenCalled();
    expect(window.location.href).toBe(url);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("下限");
    const { act } = await import("react");
    await act(async () => {
      window.history.replaceState(null, "", "/articles?minLikes=1&maxLikes=10");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(
      host.querySelector<HTMLInputElement>('[name="minLikes"]')?.value,
    ).toBe("1");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("preserves all filters in pagination and popstate while pending edits stay urgent", async () => {
    window.history.replaceState(
      null,
      "",
      "/articles?limit=1&offset=7&q=keyword&author=writer&tags=C%23&tags=a%2Cb&minLikes=0&maxLikes=10&minStocks=2&maxStocks=20",
    );
    let finish!: (response: Response) => void;
    const request = vi.fn(
      (_url: string) =>
        new Promise<Response>((done) => {
          finish = done;
        }),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await action("nav button:last-child");
    const params = new URL(window.location.href).searchParams;
    expect(params.getAll("tags")).toEqual(["C#", "a,b"]);
    expect(params.get("offset")).toBe("8");
    expect(
      parseArticleQuery(
        new URL(request.mock.calls[0][0] as string, window.location.origin)
          .searchParams,
      ),
    ).toMatchObject({
      q: "keyword",
      author: "writer",
      minLikes: 0,
      maxStocks: 20,
    });
    const field = await input("q", "next draft");
    field.focus();
    expect(field.value).toBe("next draft");
    const { act } = await import("react");
    await act(async () =>
      finish(
        new Response(JSON.stringify([sample]), {
          headers: { "X-Data-Version": "v1" },
        }),
      ),
    );
    expect(field.value).toBe("next draft");
    expect(document.activeElement).toBe(field);
    await act(async () => {
      window.history.replaceState(
        null,
        "",
        "/articles?limit=1&tags=a%2Cb&minStocks=5&author=other",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector<HTMLInputElement>('[name="author"]')?.value).toBe(
      "other",
    );
    expect(
      host.querySelector<HTMLInputElement>('[name="minStocks"]')?.value,
    ).toBe("5");
    expect(
      new URL(
        request.mock.calls[1][0] as string,
        window.location.origin,
      ).searchParams.getAll("tags"),
    ).toEqual(["a,b"]);
    await act(async () =>
      finish(new Response("[]", { headers: { "X-Data-Version": "v1" } })),
    );
  });
  it.each([
    ["1e2", 100],
    ["1.0", 1],
    ["+2", 2],
    ["0x10", 16],
  ] as const)(
    "handles popstate for server-valid numeric syntax %s",
    async (raw, expected) => {
      const request = vi
        .fn()
        .mockResolvedValue(
          new Response("[]", { headers: { "X-Data-Version": "v1" } }),
        );
      vi.stubGlobal("fetch", request);
      await mount();
      const { act } = await import("react");
      await act(async () => {
        window.history.replaceState(
          null,
          "",
          `/articles?${new URLSearchParams({ minLikes: raw, maxStocks: raw })}`,
        );
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(
        host.querySelector<HTMLInputElement>('[name="minLikes"]')?.value,
      ).toBe(String(expected));
      expect(
        host.querySelector<HTMLInputElement>('[name="maxStocks"]')?.value,
      ).toBe(String(expected));
      expect(request).toHaveBeenCalledTimes(1);
      const requested = new URL(
        request.mock.calls[0][0],
        window.location.origin,
      );
      expect(requested.searchParams.get("minLikes")).toBe(String(expected));
    },
  );
  it("applies date and select filters immediately using the complete draft and offset zero", async () => {
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="since"]', "2026-02-03");
    await change('[name="sort"]', "likesCount:desc");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1].headers).toMatchObject({
      "X-Expected-Data-Version": "v1",
    });
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
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    await vi.advanceTimersByTimeAsync(300);
    await change('[name="limit"]', "3");
    await vi.advanceTimersByTimeAsync(499);
    expect(request).not.toHaveBeenCalled();
    const { act } = await import("react");
    await act(async () =>
      root.render(articleTestElement({ initialArticles: [sample] })),
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
  it("debounces q, author, and all numeric ranges as one valid M2 query", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="q"]', "react hooks");
    await change('[name="author"]', "writer");
    await change('[name="minLikes"]', "2");
    await change('[name="maxLikes"]', "10");
    await change('[name="minStocks"]', "3");
    await change('[name="maxStocks"]', "15");
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toContain("offset=7");
    await vi.advanceTimersByTimeAsync(499);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    const url = new URL(request.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("q")).toBe("react hooks");
    expect(url.searchParams.get("author")).toBe("writer");
    expect(url.searchParams.get("minLikes")).toBe("2");
    expect(url.searchParams.get("maxLikes")).toBe("10");
    expect(url.searchParams.get("minStocks")).toBe("3");
    expect(url.searchParams.get("maxStocks")).toBe("15");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(window.location.search).toContain("q=react");
  });
  it("waits until IME composition ends and then debounces the completed text", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    const field = host.querySelector<HTMLInputElement>('[name="q"]');
    if (!field) throw new Error("Missing keyword input");
    await action('[name="q"]', "compositionstart");
    await change('[name="q"]', "日本語");
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).not.toHaveBeenCalled();
    const { act } = await import("react");
    await act(async () => {
      field.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data: "日本語",
        }),
      );
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      new URL(
        request.mock.calls[0][0],
        window.location.origin,
      ).searchParams.get("q"),
    ).toBe("日本語");
  });
  it("applies a tag selection immediately with a queued keyword draft", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount({ initialTagOptions: ["react", "typescript"] });
    await change('[name="q"]', "hooks");
    const tags = host.querySelector('[name="tags"]');
    if (!(tags instanceof HTMLSelectElement))
      throw new Error("Missing tag selector");
    const { act } = await import("react");
    await act(async () => {
      tags.options[0].selected = true;
      tags.options[1].selected = true;
      tags.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(request).toHaveBeenCalledTimes(1);
    const url = new URL(request.mock.calls[0][0], window.location.origin);
    expect(url.searchParams.get("q")).toBe("hooks");
    expect(url.searchParams.getAll("tags")).toEqual(["react", "typescript"]);
    expect(window.location.search).toContain("tags=react");
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("clears selected tags immediately with the latest full valid draft", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    window.history.replaceState(
      null,
      "",
      "/articles?limit=1&offset=7&tags=react&tags=typescript&campaign=keep",
    );
    await mount({
      initialConfig: {
        ...defaultArticleQuery,
        limit: 1,
        offset: 7,
        tags: ["react", "typescript"],
      },
      initialTagOptions: ["react", "typescript", "unknown"],
    });
    await change('[name="q"]', "hooks");
    expect(request).not.toHaveBeenCalled();
    const clear = host.querySelector<HTMLAnchorElement>(
      "[data-focus-id='articles-tag-clear']",
    );
    if (!clear) throw new Error("Missing tag-clear link");
    await action("[data-focus-id='articles-tag-clear']");
    expect(request).toHaveBeenCalledTimes(1);
    const requested = new URL(request.mock.calls[0][0], window.location.origin);
    expect(requested.searchParams.get("q")).toBe("hooks");
    expect(requested.searchParams.getAll("tags")).toEqual([]);
    expect(requested.searchParams.get("offset")).toBe("0");
    expect(
      Array.from(
        Array.from(host.querySelectorAll("select")).find((select) => select.name === "tags")?.selectedOptions ?? [],
        (option) => option.value,
      ),
    ).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("clears tag drafts without fetching or changing history while another draft is invalid", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    window.history.replaceState(
      null,
      "",
      "/articles?limit=1&offset=7&tags=react&campaign=keep",
    );
    await mount({
      initialConfig: {
        ...defaultArticleQuery,
        limit: 1,
        offset: 7,
        tags: ["react"],
      },
      initialTagOptions: ["react", "unknown"],
    });
    await change('[name="author"]', "latest writer");
    await change('[name="minLikes"]', "-1");
    const previousUrl = window.location.href;
    const clear = host.querySelector<HTMLAnchorElement>(
      "[data-focus-id='articles-tag-clear']",
    );
    if (!clear) throw new Error("Missing tag-clear link");
    await action("[data-focus-id='articles-tag-clear']");
    expect(request).not.toHaveBeenCalled();
    expect(window.location.href).toBe(previousUrl);
    expect(host.querySelector<HTMLInputElement>('[name="author"]')?.value).toBe(
      "latest writer",
    );
    expect(
      host.querySelector<HTMLInputElement>('[name="minLikes"]')?.value,
    ).toBe("-1");
    expect(
      Array.from(
        Array.from(host.querySelectorAll("select")).find((select) => select.name === "tags")?.selectedOptions ?? [],
        (option) => option.value,
      ),
    ).toEqual([]);
  });
  it("keeps automatic search text and submits valid drafts on Enter", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    expect(host.querySelector("button[type='submit']")).toBeNull();
    expect(
      host.querySelector("[data-slot='article-search-action']")?.textContent,
    ).toContain("自動検索");
    const field = host.querySelector<HTMLInputElement>('[name="q"]');
    if (!field) throw new Error("Missing search field");
    await change('[name="q"]', "keyboard");
    const { act } = await import("react");
    await act(async () => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("q=keyboard");
    expect(window.location.search).toContain("q=keyboard");
  });
  it("does not submit Enter while composition is still tracked when the key event flag is false", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    await action('[name="author"]', "compositionstart");
    const previousUrl = window.location.href;
    const author = host.querySelector<HTMLInputElement>('[name="author"]');
    if (!author) throw new Error("Missing author field");
    const { act } = await import("react");
    await act(async () => {
      author.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          isComposing: false,
        }),
      );
    });
    expect(request).not.toHaveBeenCalled();
    expect(window.location.href).toBe(previousUrl);
  });
  it("does not abort an active request on composition start and replaces it after composition", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="q"]', "old");
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
    const firstRequestUrl = request.mock.calls[0][0];
    await action('[name="q"]', "compositionstart");
    expect(request.mock.calls[0][0]).toBe(firstRequestUrl);
    await change('[name="q"]', "new");
    await action('[name="q"]', "compositionend");
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).not.toBe(firstRequestUrl);
    expect(
      new URL(
        request.mock.calls[1][0],
        window.location.origin,
      ).searchParams.get("q"),
    ).toBe("new");
  });
  it("includes a pending numeric draft in an immediate select search", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    await change('[name="sort"]', "stocksCount:desc");
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
      .mockResolvedValue(
        new Response(JSON.stringify([sample]), {
          headers: { "X-Data-Version": "v1" },
        }),
      );
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
  it("submitting an in-flight identical search does not abort or duplicate it", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="q"]', "active");
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
    const historyLength = window.history.length;
    const requestUrl = request.mock.calls[0][0];
    await action("form", "submit");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(requestUrl);
    expect(window.history.length).toBe(historyLength);
  });
  it("cancels a pending debounce on history navigation and restores draft from the URL", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
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
    const orderField = host.querySelector('[name="sort"]');
    if (!(orderField instanceof HTMLSelectElement))
      throw new Error("Missing order field select");
    expect(orderField.value).toBe("stocksCount:desc");
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
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "2");
    await vi.advanceTimersByTimeAsync(250);
    const { act } = await import("react");
    await act(async () => root.unmount());
    await vi.advanceTimersByTimeAsync(500);
    expect(request).not.toHaveBeenCalled();
  });
  it("allows obsolete requests to finish without replacing current results", async () => {
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
    await change('[name="sort"]', "likesCount:desc");
    await change('[name="sort"]', "likesCount:asc");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1].headers).toMatchObject({
      "X-Expected-Data-Version": "v1",
    });
    const { act } = await import("react");
    await act(async () =>
      pending[0].reject(new DOMException("Aborted", "AbortError")),
    );
    await act(async () =>
      pending[1].resolve(
        new Response(JSON.stringify([{ ...sample, title: "Latest article" }]), {
          headers: { "X-Data-Version": "v1" },
        }),
      ),
    );
    expect(host.textContent).toContain("Latest article");
    expect(host.textContent).not.toContain("Article A");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain("読み込み中");
  });
  it("keeps invalid numeric drafts editable and does not search until the full draft is valid", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    await change('[name="limit"]', "101");
    await change('[name="since"]', "2026-04-05");
    await change('[name="sort"]', "stocksCount:desc");
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
    const orderField = host.querySelector('[name="sort"]');
    if (!(orderField instanceof HTMLSelectElement))
      throw new Error("Missing order field select");
    expect(orderField.value).toBe("stocksCount:desc");

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
      .mockResolvedValueOnce(
        new Response("failure", {
          headers: { "X-Data-Version": "v1" },
          status: 503,
        }),
      )
      .mockResolvedValueOnce(
        new Response("[]", { headers: { "X-Data-Version": "v1" } }),
      );
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

describe("extended filters", () => {
  it("round trips repeated punctuation tags and every inclusive bound", () => {
    const query = parseArticleQuery(
      configQueryParams({
        ...defaultArticleQuery,
        q: "  100%_\\  ",
        author: " Alice ",
        tags: [" C# ", "a,b", "C#", ""],
        minLikes: 0,
        maxLikes: 10,
        minStocks: 2,
        maxStocks: 20,
        offset: 17,
      }),
    );
    expect(query).toMatchObject({
      q: "100%_\\",
      author: "Alice",
      tags: ["C#", "a,b"],
      minLikes: 0,
      maxLikes: 10,
      minStocks: 2,
      maxStocks: 20,
      offset: 17,
    });
    const params = articleQueryParams(query);
    expect(params.getAll("tags")).toEqual(["C#", "a,b"]);
    expect(parseArticleQuery(params)).toEqual(query);
    expect(params.has("since")).toBe(false);
  });
  it("rejects malformed or inverted ranges and filter length limits", () => {
    for (const input of [
      "minLikes=-1",
      "maxStocks=1.5",
      "minLikes=20&maxLikes=10",
      "minStocks=2&maxStocks=1",
      "maxLikes=9007199254740992",
      `q=${"x".repeat(201)}`,
      `tags=${"x".repeat(101)}`,
    ])
      expect(() => parseArticleQuery(new URLSearchParams(input))).toThrow();
    expect(() =>
      parseArticleQuery(
        configQueryParams({
          tags: Array.from({ length: 21 }, (_, i) => String(i)),
        }),
      ),
    ).toThrow();
  });
  it("keeps empty draft bounds absent and resets offset at commit", () => {
    const draft = toArticleDraft({ ...defaultArticleQuery, offset: 30 });
    expect(draft.minLikes).toBe("");
    expect(commitArticleDraft({ ...draft, minLikes: " 0 " })).toMatchObject({
      minLikes: 0,
      maxLikes: null,
      offset: 0,
    });
    expect(() => commitArticleDraft({ ...draft, minLikes: "-" })).toThrow();
  });
});

describe("count coercion agrees with the server", () => {
  it.each([
    ["1e2", 100],
    ["1.0", 1],
    ["+2", 2],
    ["0x10", 16],
    ["  ", null],
  ] as const)(
    "normalizes %s without rejecting a server-valid count",
    (raw, expected) => {
      const params = new URLSearchParams({
        minLikes: raw,
        maxLikes: raw,
        minStocks: raw,
        maxStocks: raw,
      });
      const query = parseArticleQuery(params);
      expect(query).toMatchObject({
        minLikes: expected,
        maxLikes: expected,
        minStocks: expected,
        maxStocks: expected,
      });
      expect(
        commitArticleDraft({
          ...toArticleDraft(defaultArticleQuery),
          minLikes: raw,
        }),
      ).toMatchObject({ minLikes: expected });
      expect(toArticleDraft(query).minLikes).toBe(
        expected === null ? "" : String(expected),
      );
      expect(parseArticleQuery(articleQueryParams(query))).toEqual(query);
    },
  );
  it.each(["-1", "1e-2", "1.5", "Infinity", "NaN", "9007199254740992", "-"])(
    "rejects invalid count %s in both URL and draft",
    (raw) => {
      expect(() =>
        parseArticleQuery(new URLSearchParams({ minLikes: raw })),
      ).toThrow();
      expect(() =>
        commitArticleDraft({
          ...toArticleDraft(defaultArticleQuery),
          minLikes: raw,
        }),
      ).toThrow();
    },
  );
  it("checks inclusive ranges after numeric coercion", () => {
    expect(() =>
      parseArticleQuery(
        new URLSearchParams({ minLikes: "1e2", maxLikes: "0x10" }),
      ),
    ).toThrow();
    expect(() =>
      commitArticleDraft({
        ...toArticleDraft(defaultArticleQuery),
        minStocks: "1e2",
        maxStocks: "0x10",
      }),
    ).toThrow();
  });
});
