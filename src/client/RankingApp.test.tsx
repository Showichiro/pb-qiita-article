// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ArticleCountGroupByUser, LikesCountSchema } from "@/schemas";
import RankingApp from "./RankingApp";
import { QueryProvider, seedQueryData } from "./query-client";
import { rankingPostsQueryKey, rankingLikesQueryKey } from "./queries";
import { resetTestQueries } from "./test-query-client";
beforeEach(resetTestQueries);
import {
  defaultRankingQuery,
  rankingQueryParams,
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
    initialDataVersion?: string;
    query?: RankingQuery;
    draft?: RankingDraft;
    posts?: ArticleCountGroupByUser[];
    likes?: LikesCountSchema[];
  } = {},
) {
  const query = options.query ?? defaultRankingQuery;
  window.history.replaceState(
    null,
    "",
    `/ranking?${rankingQueryParams(query)}`,
  );
  const dates = { since: query.since, until: query.until };
  seedQueryData(rankingPostsQueryKey("v1", dates), {
    query: dates,
    rows: options.posts ?? postCounts,
  });
  seedQueryData(rankingLikesQueryKey("v1", dates), {
    query: dates,
    rows: options.likes ?? likesCounts,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  const appRoot = createRoot(container);
  root = appRoot;
  act(() =>
    appRoot.render(
      <QueryProvider>
        <RankingApp
          initialConfig={options.query ?? defaultRankingQuery}
          initialPostCounts={options.posts ?? postCounts}
          initialLikesCounts={options.likes ?? likesCounts}
          initialDataVersion="v1"
          initialDraft={options.draft}
        />
      </QueryProvider>,
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
    headers: new Headers({ "X-Data-Version": "v1" }),
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

afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
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
    mount({ initialDataVersion: "v1" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(date("since").value).toBe("");
    expect(date("until").value).toBe("");
    expect(select("view").value).toBe("table");
    expect(select("topN").value).toBe("10");
    expect(container.querySelector("button[type=submit]")).toBeNull();
    const actionHint = container.querySelector("[data-ranking-action]");
    expect(container.textContent).not.toContain("自動検索");
    expect(actionHint?.getAttribute("tabindex")).toBe("-1");
    expect(container.querySelectorAll("table")).toHaveLength(2);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(container.textContent).toContain("900");
    expect(container.textContent).toContain("現在の合計いいね数");
  });

  it("changes view and top-N history without a data request and restores on popstate", async () => {
    mount({ initialDataVersion: "v1" });
    choose("view", "chart");
    choose("topN", "2");
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.waitFor(() =>
        expect(new URLSearchParams(window.location.search)).toEqual(
          new URLSearchParams("view=chart&topN=2"),
        ),
      );
    });
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
    mount({ initialDataVersion: "v1" });
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
      initialDataVersion: "v1",
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
    mount({ initialDataVersion: "v1" });
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
    mount({ initialDataVersion: "v1" });
    await changeDate("since", "2026-12-31");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const activeRequests = fetchMock.mock.calls.map(([url]) => String(url));
    await changeDate("until", "2026-01-01");
    expect(date("until").value).toBe("2026-01-01");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      activeRequests,
    );
    await act(async () => {
      select("view").value = "chart";
      select("view").dispatchEvent(new Event("change", { bubbles: true }));
      select("topN").value = "3";
      select("topN").dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(date("until").value).toBe("2026-01-01");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      activeRequests,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.waitFor(() =>
        expect(window.location.search).toBe(
          "?since=2026-12-31&view=chart&topN=3",
        ),
      );
    });
    post.resolve(response(postCounts));
    await act(async () => {
      await post.promise;
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(container.textContent).not.toContain("読み込み中");
    });
    expect(date("until").value).toBe("2026-01-01");
    expect(container.textContent).toContain("2026-12-31");
  });

  it("obsolete intent fences stale date requests and renders only the latest rows without an alert", async () => {
    fetchMock
      .mockResolvedValueOnce(response(postCounts))
      .mockResolvedValueOnce(response(likesCounts))
      .mockResolvedValueOnce(response(postCounts))
      .mockResolvedValueOnce(response(likesCounts));
    mount({ initialDataVersion: "v1" });
    await changeDate("since", "2026-01-01");
    await changeDate("since", "2026-02-01");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Latest intent should commit, obsolete intent should not
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain("9");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("読み込み中");
  });

  it("retries a real same-query failure when the native search form submits", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(response([], 503))
      .mockResolvedValueOnce(response(likesCounts))
      .mockResolvedValueOnce(response(postCounts))
      .mockResolvedValueOnce(response(likesCounts));
    mount({ initialDataVersion: "v1" });
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

  it("unmount does not commit pending intent", async () => {
    fetchMock.mockResolvedValueOnce(response(postCounts));
    fetchMock.mockResolvedValueOnce(response(likesCounts));
    mount({ initialDataVersion: "v1" });
    await changeDate("since", "2026-01-01");
    act(() => root?.unmount());
    root = undefined;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    // Intent should not commit after unmount
  });
});

test("period shortcuts retain ranking presentation and request both rankings once", async () => {
  fetchMock.mockImplementation(async () => response([]));
  mount({ query: { ...defaultRankingQuery, view: "chart", topN: 5 } });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-focus-id="period-90days"]')
      ?.click(),
  );
  await act(async () => {
    await vi.waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("until")).toMatch(
        /T14:59:59.999Z$/,
      ),
    );
  });
  const params = new URLSearchParams(window.location.search);
  expect(params.get("view")).toBe("chart");
  expect(params.get("topN")).toBe("5");
  expect(params.get("until")).toMatch(/T14:59:59.999Z$/);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(
    container
      .querySelector('[data-focus-id="period-90days"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
});

test("date validation describes both inputs only while the error is displayed", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes("post-counts")
      ? response(postCounts)
      : response(likesCounts),
  );
  mount({ draft: { since: "2026-12-31", until: "2026-01-01" } });
  for (const field of [date("since"), date("until")]) {
    expect(field.hasAttribute("aria-describedby")).toBe(false);
  }

  act(() => {
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  const error = container.querySelector('[role="alert"]');
  expect(error?.textContent).toBe("開始日は終了日より前にしてください");
  expect(error?.id).toBe("ranking-date-validation-error");
  for (const field of [date("since"), date("until")]) {
    expect(field.getAttribute("aria-describedby")).toBe(error?.id);
    expect(container.querySelector(`label[for="${field.id}"]`)).not.toBeNull();
  }
  expect(fetchMock).not.toHaveBeenCalled();

  await changeDate("since", "");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  for (const field of [date("since"), date("until")]) {
    expect(field.hasAttribute("aria-describedby")).toBe(false);
  }
});

test("history search failure retains both adopted rankings and retries the requested dates", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes("post-counts")
      ? response([], 503)
      : response(likesCounts),
  );
  mount();
  await act(async () => {
    window.history.replaceState(
      null,
      "",
      "/ranking?since=2026-03-01&view=chart&topN=2",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(date("since").value).toBe("2026-03-01");
  expect(select("view").value).toBe("chart");
  expect(container.textContent).toContain("ada");
  expect(container.textContent).toContain("全期間");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "503",
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);

  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes("post-counts")
      ? response([{ userId: "new", userName: "New", count: 4 }])
      : response([{ userId: "new", userName: "New", totalLikesCount: "40" }]),
  );
  await act(async () => {
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "再試行",
    );
    expect(retry).toBeDefined();
    retry?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("2026-03-01");
  expect(container.textContent).toContain("New");
  expect(container.textContent).not.toContain("ada");
});

test("preserves unrelated parameters, timestamp dates and defaults without adding duplicate history entries", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes("post-counts")
      ? response(postCounts)
      : response(likesCounts),
  );
  mount({
    query: { ...defaultRankingQuery, since: "2026-01-01T15:00:00.000Z" },
  });
  window.history.replaceState(
    { marker: "kept" },
    "",
    `${window.location.href}&campaign=test#ranking`,
  );
  const initialLength = window.history.length;
  choose("view", "chart");
  await act(async () => {
    await vi.waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("view")).toBe(
        "chart",
      ),
    );
  });
  const params = new URLSearchParams(window.location.search);
  expect(params.get("since")).toBe("2026-01-01T15:00:00.000Z");
  expect(params.get("campaign")).toBe("test");
  expect(params.has("topN")).toBe(false);
  expect(window.location.hash).toBe("#ranking");
  expect(window.history.state).toEqual({ marker: "kept" });
  expect(window.history.length).toBe(initialLength + 1);
  choose("view", "chart");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  expect(window.history.length).toBe(initialLength + 1);
  expect(fetchMock).not.toHaveBeenCalled();
});
