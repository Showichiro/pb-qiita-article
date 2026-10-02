// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import RankingApp from "./RankingApp";
import {
  defaultRankingQuery,
  type RankingDraft,
  type RankingQuery,
} from "./ranking";

const postCounts: ArticleCountGroupByUser[] = [
  { userId: "ada", userName: "Ada", count: 9 },
  { userId: "grace", userName: "Grace", count: 6 },
  { userId: "linus", userName: "Linus", count: 3 },
];
const likesCounts: LikesCountSchema[] = [
  { userId: "ada", userName: "Ada", totalLikesCount: "900" },
  { userId: "grace", userName: "Grace", totalLikesCount: null },
  { userId: "linus", userName: "Linus", totalLikesCount: "300" },
];

let container: HTMLDivElement;
let root: Root | undefined;
let previousUrl: string;
let fetchMock: ReturnType<typeof vi.fn>;

function mount(
  options: {
    query?: RankingQuery;
    draft?: RankingDraft;
    posts?: ArticleCountGroupByUser[];
    likes?: LikesCountSchema[];
  } = {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  const appRoot = createRoot(container);
  root = appRoot;
  act(() =>
    appRoot.render(
      <RankingApp
        initialConfig={options.query ?? defaultRankingQuery}
        initialPostCounts={options.posts ?? postCounts}
        initialLikesCounts={options.likes ?? likesCounts}
        initialDraft={options.draft}
      />,
    ),
  );
}

function select(name: string): HTMLSelectElement {
  const field = container.querySelector(
    `select[name="${name}"]`,
  ) as HTMLSelectElement | null;
  if (!field) throw new Error(`Missing select ${name}`);
  return field;
}

function date(name: "since" | "until"): HTMLInputElement {
  const field = container.querySelector(
    `input[name="${name}"]`,
  ) as HTMLInputElement | null;
  if (!field) throw new Error(`Missing date input ${name}`);
  return field;
}

function choose(name: string, value: string) {
  act(() => {
    select(name).value = value;
    select(name).dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeDate(name: "since" | "until", value: string) {
  await act(async () => {
    const input = date(name);
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
  previousUrl = window.location.href;
  window.history.replaceState(null, "", "/ranking");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  container?.remove();
  window.history.replaceState(null, "", previousUrl);
  vi.unstubAllGlobals();
});

describe("RankingApp", () => {
  it("renders SSR bootstrap data, normalized empty dates, and table defaults without fetching", () => {
    mount();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(date("since").value).toBe("");
    expect(date("until").value).toBe("");
    expect(select("view").value).toBe("table");
    expect(select("topN").value).toBe("10");
    expect(container.querySelector("button[type=submit]")).toBeNull();
    const actionHint = container.querySelector("[data-ranking-action]");
    expect(actionHint?.textContent).toBe("自動検索");
    expect(actionHint?.getAttribute("tabindex")).toBe("-1");
    expect(actionHint?.className).toContain("h-9 w-28");
    expect(container.querySelectorAll("table")).toHaveLength(2);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(container.textContent).toContain("900");
    expect(container.textContent).toContain("現在の合計いいね数");
  });

  it("changes view and top-N history without a data request and restores on popstate", () => {
    mount();
    choose("view", "chart");
    choose("topN", "2");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search)).toEqual(
      new URLSearchParams("view=chart&topN=2"),
    );
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(4);
    expect(container.querySelectorAll(`[class*="h-[320px]"]`)).toHaveLength(2);

    window.history.replaceState(null, "", "/ranking?topN=1");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(select("view").value).toBe("table");
    expect(select("topN").value).toBe("1");
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores dates, display controls, and matching rows from a history URL", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response([{ userId: "new-author", userName: "New", count: 4 }]),
      )
      .mockResolvedValueOnce(
        response([
          { userId: "new-author", userName: "New", totalLikesCount: "40" },
        ]),
      );
    mount();
    window.history.replaceState(
      null,
      "",
      "/ranking?since=2026-03-01&until=2026-03-31&view=chart&topN=1",
    );
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(date("since").value).toBe("2026-03-01");
    expect(date("until").value).toBe("2026-03-31");
    expect(select("view").value).toBe("chart");
    expect(select("topN").value).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(2);
    expect(container.textContent).toContain("new-author");
    expect(container.textContent).toContain("2026-03-01 から 2026-03-31");
    expect(container.textContent).not.toContain("ada");
  });

  it("renders accessible named Recharts with the same top-N rows as its native tables", async () => {
    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: { width: 640, height: 320 },
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    mount({
      query: { ...defaultRankingQuery, view: "chart", topN: 2 },
    });
    await act(async () => {
      await Promise.resolve();
    });
    const charts = container.querySelectorAll(
      '[role="application"][tabindex="0"]',
    );
    expect(charts.length).toBe(2);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(4);
    expect(container.textContent).toContain("ada");
    expect(container.textContent).toContain("grace");
    expect(container.textContent).not.toContain("linus");
    expect(container.textContent).toContain("900");
    expect(container.textContent).toContain("現在の合計いいね数");
  });

  it("starts valid date requests immediately and sends date filters only", async () => {
    fetchMock
      .mockResolvedValueOnce(response(postCounts))
      .mockResolvedValueOnce(response(likesCounts));
    mount();
    await act(async () => {
      const input = date("since");
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "2026-01-01");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/ranking/post-counts?since=2026-01-01",
    );
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "/api/ranking/likes-counts?since=2026-01-01",
    );
    expect(window.location.search).toBe("?since=2026-01-01");
    await changeDate("since", "2026-01-01");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an inverted urgent date draft and active request through display changes", async () => {
    const post = defer<ReturnType<typeof response>>();
    fetchMock.mockImplementation((_url: string, _options: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        return post.promise;
      }
      return Promise.resolve(response(likesCounts));
    });
    mount();
    await changeDate("since", "2026-12-31");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const activeSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await changeDate("until", "2026-01-01");
    expect(date("until").value).toBe("2026-01-01");
    expect(activeSignal.aborted).toBe(false);
    await act(async () => {
      select("view").value = "chart";
      select("view").dispatchEvent(new Event("change", { bubbles: true }));
      select("topN").value = "3";
      select("topN").dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(date("until").value).toBe("2026-01-01");
    expect(activeSignal.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?since=2026-12-31&view=chart&topN=3");
    post.resolve(response(postCounts));
    await act(async () => {
      await post.promise;
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("読み込み中");
  });

  it("aborts stale date requests and renders only the latest rows without an alert", async () => {
    const first = defer<ReturnType<typeof response>>();
    fetchMock
      .mockImplementationOnce((_url: string, options: RequestInit) => {
        (options.signal as AbortSignal).addEventListener("abort", () => {
          first.reject(new DOMException("Request aborted", "AbortError"));
        });
        return first.promise;
      })
      .mockResolvedValueOnce(response(postCounts))
      .mockResolvedValueOnce(response(likesCounts));
    mount();
    await changeDate("since", "2026-01-01");
    const staleSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await changeDate("since", "2026-02-01");
    expect(staleSignal.aborted).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("9");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("読み込み中");
  });

  it("retries a real same-query failure when the native search form submits", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(response([], 503))
      .mockResolvedValueOnce(response(postCounts))
      .mockResolvedValueOnce(response(likesCounts));
    mount();
    await changeDate("since", "2026-01-01");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "(503)",
    );
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(6);
    expect(container.textContent).toContain("全期間");
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing ranking form");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
    errorLog.mockRestore();
  });

  it("cancels its active request on unmount", async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise((_, reject) => {
          const options = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
          (options.signal as AbortSignal).addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    mount();
    await changeDate("since", "2026-01-01");
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    act(() => root?.unmount());
    expect(signal.aborted).toBe(true);
    root = undefined;
  });
});
