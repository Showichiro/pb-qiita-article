// @vitest-environment jsdom
import type { ArticlesAppProps } from "./ArticlesApp";
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
    window.history.replaceState(null, "", "/articles?limit=1&offset=7");
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
    const request = vi.fn().mockResolvedValue(new Response("[]"));
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
    await act(async () => finish(new Response(JSON.stringify([sample]))));
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
    await act(async () => finish(new Response("[]")));
  });
  it.each([
    ["1e2", 100],
    ["1.0", 1],
    ["+2", 2],
    ["0x10", 16],
  ] as const)(
    "handles popstate for server-valid numeric syntax %s",
    async (raw, expected) => {
      const request = vi.fn().mockResolvedValue(new Response("[]"));
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
  it("aborts stale requests and prevents old responses replacing current results", async () => {
    const pending: Array<(response: Response) => void> = [];
    const request = vi
      .fn()
      .mockImplementation(
        () => new Promise<Response>((done) => pending.push(done)),
      );
    vi.stubGlobal("fetch", request);
    await mount();
    await action("form", "submit");
    await action("form", "submit");
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    const { act } = await import("react");
    await act(async () => pending[1](new Response("[]")));
    await act(async () => pending[0](new Response(JSON.stringify([sample]))));
    expect(host.textContent).toContain("該当する記事はありません。");
    expect(host.textContent).not.toContain("Article A");
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
