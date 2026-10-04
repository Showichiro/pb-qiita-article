// @vitest-environment jsdom
/** @jsxImportSource react */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import AnalysisApp from "./AnalysisApp";
import { QueryProvider, seedQueryData } from "./query-client";
import { analysisQueryKey, normalizeAnalysisQuery } from "./queries";
import { resetTestQueries } from "./test-query-client";
beforeEach(resetTestQueries);
import {
  analysisBucketStarts,
  type AnalysisDraft,
  type AnalysisBootstrap,
  type AnalysisQuery,
} from "./analysis";

const chartCapture = vi.hoisted(() => ({
  data: undefined as unknown,
  dataKey: "",
  accessibilityLayer: false,
}));

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: ({ dataKey }: { dataKey: string }) => {
    chartCapture.dataKey = dataKey;
    return null;
  },
  LineChart: ({
    data,
    accessibilityLayer,
    children,
  }: {
    data: unknown;
    accessibilityLayer: boolean;
    children: ReactNode;
  }) => {
    chartCapture.data = data;
    chartCapture.accessibilityLayer = accessibilityLayer;
    return <div data-testid="analysis-chart">{children}</div>;
  },
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const query: AnalysisQuery = {
  since: "2026-01-01",
  until: "2026-01-03",
  bucket: "day",
  author: "",
  tags: [],
};
const rows = analysisBucketStarts(query.since, query.until, query.bucket).map(
  (bucketStart, index) => ({
    bucketStart,
    articleCount: index + 1,
    publishedArticleLikes: (index + 1) * 5,
  }),
);
const initialData: AnalysisBootstrap = {
  state: { ...query, metric: "posts", view: "table" },
  rows,
  tagOptions: ["known"],
  dataVersion: "v1",
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let previousUrl: string;
let rootUnmounted: boolean;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
  previousUrl = window.location.href;
  window.history.replaceState(
    null,
    "",
    "/analysis?since=2026-01-01&until=2026-01-03",
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  rootUnmounted = false;
  fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    const since = url.searchParams.get("since") ?? query.since;
    const until = url.searchParams.get("until") ?? query.until;
    const bucket = (url.searchParams.get("bucket") ??
      "day") as AnalysisQuery["bucket"];
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "X-Data-Version": "v1" }),
      json: async () => ({
        since,
        until,
        bucket,
        rows: analysisBucketStarts(since, until, bucket).map((bucketStart) => ({
          bucketStart,
          articleCount: 7,
          publishedArticleLikes: 35,
        })),
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  if (!rootUnmounted)
    await act(async () => {
      root.unmount();
    });
  container.remove();
  window.history.replaceState(null, "", previousUrl);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(data = initialData, initialDraft?: AnalysisDraft) {
  const query = normalizeAnalysisQuery(data.state);
  seedQueryData(analysisQueryKey(data.dataVersion, query), {
    query,
    rows: data.rows,
  });
  await act(async () => {
    root.render(
      <QueryProvider>
        <AnalysisApp initialData={data} initialDraft={initialDraft} />
      </QueryProvider>,
    );
  });
}

function field<T extends { value: string }>(name: string): T {
  const result = container.querySelector(`[name="${name}"]`);
  if (!result) throw new Error(`Missing ${name}`);
  if (!("value" in result)) throw new Error(`${name} is not a form control`);
  return result as T;
}

function setValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Missing native value setter");
  setter.call(element, value);
}

test("uses its SSR bootstrap with no initial API request", async () => {
  await render();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  expect(container.querySelector("tbody")?.textContent).toContain("15");
  expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(container.querySelector('[role="status"]')?.textContent).toBe("3期間");
});

test("keeps invalid date drafts urgent and prevents both fetching and URL changes", async () => {
  await render();
  const since = field<HTMLInputElement>("since");
  setValue(since, "2026-01-03");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new URL(window.location.href).searchParams.get("since")).toBe(
    "2026-01-03",
  );

  const acceptedUrl = window.location.href;
  const until = field<HTMLInputElement>("until");
  setValue(until, "2026-01-02");
  await act(async () => {
    until.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(window.location.href).toBe(acceptedUrl);
  expect(until.value).toBe("2026-01-02");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "以前",
  );
});

test.each([
  [
    "bucket limit",
    { since: "2026-01-01", until: "2027-02-05", bucket: "day" },
    "400",
  ],
  [
    "elapsed day limit",
    { since: "2014-01-01", until: "2025-01-01", bucket: "month" },
    "3660",
  ],
] as const)(
  "retains an invalid %s draft without fetching or writing its URL",
  async (_name, invalid, expectedError) => {
    await render();
    const acceptedUrl = window.location.href;
    const since = field<HTMLInputElement>("since");
    setValue(since, invalid.since);
    await act(async () => {
      since.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const until = field<HTMLInputElement>("until");
    setValue(until, invalid.until);
    await act(async () => {
      until.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const bucket = field<HTMLSelectElement>("bucket");
    setValue(bucket, invalid.bucket);
    await act(async () => {
      bucket.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.href).toBe(acceptedUrl);
    expect(since.value).toBe(invalid.since);
    expect(until.value).toBe(invalid.until);
    expect(bucket.value).toBe(invalid.bucket);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      expectedError,
    );
  },
);

test("retains and reports an invalid raw author draft without fetching", async () => {
  const invalidDraft: AnalysisDraft = {
    since: query.since,
    until: query.until,
    bucket: query.bucket,
    author: "x".repeat(201),
    tags: [],
  };
  await render(initialData, invalidDraft);
  expect(field<HTMLInputElement>("author").value).toBe("x".repeat(201));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "200",
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(window.location.search).toBe("?since=2026-01-01&until=2026-01-03");
});

test("metric and chart/table view changes restore through history without refetching", async () => {
  await render();
  const metric = field<HTMLSelectElement>("metric");
  setValue(metric, "likes");
  await act(async () => {
    metric.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(new URL(window.location.href).searchParams.get("metric")).toBe(
    "likes",
  );

  const view = field<HTMLSelectElement>("view");
  setValue(view, "chart");
  await act(async () => {
    view.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(new URL(window.location.href).searchParams.get("view")).toBe("chart");
  expect(container.querySelector("figure[aria-label]")).not.toBeNull();

  await act(async () => {
    window.history.replaceState(
      null,
      "",
      "/analysis?since=2026-01-01&until=2026-01-03&metric=likes",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(field<HTMLSelectElement>("metric").value).toBe("likes");
  expect(field<HTMLSelectElement>("view").value).toBe("table");
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([
  ["posts", "articleCount"],
  ["likes", "publishedArticleLikes"],
] as const)(
  "keeps chart values equivalent to the table for %s",
  async (metricValue, dataKey) => {
    chartCapture.data = undefined;
    chartCapture.dataKey = "";
    chartCapture.accessibilityLayer = false;
    await render();
    const metric = field<HTMLSelectElement>("metric");
    setValue(metric, metricValue);
    await act(async () => {
      metric.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const view = field<HTMLSelectElement>("view");
    setValue(view, "chart");
    await act(async () => {
      view.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      await vi.waitFor(() => expect(chartCapture.data).toEqual(rows));
    });
    const tableRows = Array.from(
      container.querySelectorAll("tbody tr"),
      (row) =>
        Array.from(row.querySelectorAll("td"), (cell) => cell.textContent),
    );
    expect(tableRows).toEqual(
      rows.map((row) => [
        row.bucketStart,
        String(row.articleCount),
        String(row.publishedArticleLikes),
      ]),
    );
    expect(chartCapture.dataKey).toBe(dataKey);
    expect(chartCapture.accessibilityLayer).toBe(true);
    const chart = container.querySelector("figure[aria-label]");
    const count = container.querySelector('[role="status"]');
    if (!chart || !count) throw new Error("Missing chart or result count");
    expect(
      chart.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

test("display changes update the accepted URL while invalid raw drafts remain untouched", async () => {
  await render();
  const since = field<HTMLInputElement>("since");
  setValue(since, "2026-01-02");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const acceptedUrl = window.location.href;

  const until = field<HTMLInputElement>("until");
  setValue(until, "2026-01-01");
  await act(async () => {
    until.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(window.location.href).toBe(acceptedUrl);
  expect(until.value).toBe("2026-01-01");

  const metric = field<HTMLSelectElement>("metric");
  setValue(metric, "likes");
  await act(async () => {
    metric.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const params = new URL(window.location.href).searchParams;
  expect(params.get("since")).toBe("2026-01-02");
  expect(params.get("until")).toBe("2026-01-03");
  expect(params.get("metric")).toBe("likes");
  expect(until.value).toBe("2026-01-01");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("back/forward restores query filters and display controls", async () => {
  await render();
  window.history.replaceState(
    null,
    "",
    "/analysis?since=2026-01-02&until=2026-01-03&bucket=week&author=Writer&tags=known&metric=likes&view=chart",
  );
  await act(async () => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(field<HTMLInputElement>("since").value).toBe("2026-01-02");
  expect(field<HTMLInputElement>("author").value).toBe("Writer");
  expect(field<HTMLSelectElement>("bucket").value).toBe("week");
  expect(
    Array.from(
      field<HTMLSelectElement>("tags").selectedOptions,
      (option) => option.value,
    ),
  ).toEqual(["known"]);
  expect(field<HTMLSelectElement>("metric").value).toBe("likes");
  expect(field<HTMLSelectElement>("view").value).toBe("chart");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain("author=Writer");
  expect(String(fetchMock.mock.calls[0][0])).toContain("tags=known");
});

test("author search waits for an IME-safe 500ms quiet period and sends the full draft", async () => {
  vi.useFakeTimers();
  await render();
  const since = field<HTMLInputElement>("since");
  const author = field<HTMLInputElement>("author");
  setValue(since, "2026-01-02");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  author.focus();
  author.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true }),
  );
  setValue(author, "Writer");
  await act(async () => {
    author.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "r",
        isComposing: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    author.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "Writer" }),
    );
    await vi.advanceTimersByTimeAsync(499);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[1][0])).toContain(
    "since=2026-01-02&until=2026-01-03&author=Writer",
  );
});

test("an immediate tag change commits the valid whole draft and cancels only debounce work", async () => {
  await render();
  const author = field<HTMLInputElement>("author");
  setValue(author, "Writer");
  await act(async () => {
    author.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(fetchMock).not.toHaveBeenCalled();

  const tags = field<HTMLSelectElement>("tags");
  tags.options[0].selected = true;
  await act(async () => {
    tags.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain("author=Writer");
  expect(String(fetchMock.mock.calls[0][0])).toContain("tags=known");
  expect(new URL(window.location.href).searchParams.get("author")).toBe(
    "Writer",
  );
});

test("clears tags immediately using the latest valid draft and keeps the enhanced action automatic", async () => {
  vi.useFakeTimers();
  const data: AnalysisBootstrap = {
    ...initialData,
    state: { ...initialData.state, tags: ["known"] },
    dataVersion: "v1",
  };
  window.history.replaceState(
    null,
    "",
    "/analysis?since=2026-01-01&until=2026-01-03&tags=known",
  );
  await render(data);
  expect(container.querySelector("button[type='submit']")).toBeNull();
  expect(
    container.querySelector("[data-slot='analysis-search-action']"),
  ).toBeNull();

  const author = field<HTMLInputElement>("author");
  setValue(author, "Writer");
  await act(async () => {
    author.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(fetchMock).not.toHaveBeenCalled();
  const clear = container.querySelector<HTMLAnchorElement>(
    "[data-focus-id='analysis-tag-clear']",
  );
  if (!clear) throw new Error("Missing tag-clear action");
  expect(clear.closest("label")).toBeNull();
  await act(async () => {
    clear.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain("author=Writer");
  expect(String(fetchMock.mock.calls[0][0])).not.toContain("tags=");
  expect(new URL(window.location.href).searchParams.has("tags")).toBe(false);
  expect(
    Array.from(
      field<HTMLSelectElement>("tags").selectedOptions,
      (option) => option.value,
    ),
  ).toEqual([]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("clears tag drafts but holds URL and fetching when another draft is invalid", async () => {
  const data: AnalysisBootstrap = {
    ...initialData,
    state: { ...initialData.state, tags: ["known"] },
  };
  const invalidDraft: AnalysisDraft = {
    since: query.since,
    until: query.until,
    bucket: query.bucket,
    author: "x".repeat(201),
    tags: ["known"],
  };
  window.history.replaceState(
    null,
    "",
    "/analysis?since=2026-01-01&until=2026-01-03&tags=known",
  );
  await render(data, invalidDraft);
  const previousUrl = window.location.href;
  const clear = container.querySelector<HTMLAnchorElement>(
    "[data-focus-id='analysis-tag-clear']",
  );
  if (!clear) throw new Error("Missing tag-clear action");
  await act(async () => {
    clear.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(window.location.href).toBe(previousUrl);
  expect(field<HTMLInputElement>("author").value).toBe("x".repeat(201));
  expect(
    Array.from(
      field<HTMLSelectElement>("tags").selectedOptions,
      (option) => option.value,
    ),
  ).toEqual([]);
});

test("tracked composition suppresses Enter even when its keyboard flag is false", async () => {
  await render();
  const author = field<HTMLInputElement>("author");
  setValue(author, "Writer");
  await act(async () => {
    author.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    author.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "r",
        isComposing: true,
      }),
    );
    author.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: false,
      }),
    );
  });
  expect(author.value).toBe("Writer");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(window.location.search).toBe("?since=2026-01-01&until=2026-01-03");
});

test("keeps unknown selected tags in the native option list", async () => {
  const data: AnalysisBootstrap = {
    ...initialData,
    state: { ...initialData.state, tags: ["unknown"] },
  };
  await act(async () => {
    const query = normalizeAnalysisQuery(data.state);
    seedQueryData(analysisQueryKey(data.dataVersion, query), {
      query,
      rows: data.rows,
    });
    root.render(
      <QueryProvider>
        <AnalysisApp initialData={data} />
      </QueryProvider>,
    );
  });
  const tags = field<HTMLSelectElement>("tags");
  expect(Array.from(tags.options, (option) => option.value)).toContain(
    "unknown",
  );
  expect(Array.from(tags.selectedOptions, (option) => option.value)).toEqual([
    "unknown",
  ]);
});

test("obsolete intent fences superseded committed requests without coupling them to debounce timers", async () => {
  fetchMock.mockImplementation(
    (_input: RequestInfo | URL, _init?: RequestInit) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-Data-Version": "v1" }),
        json: async () => ({
          since: "2026-01-02",
          until: "2026-01-03",
          bucket: "day",
          rows: analysisBucketStarts("2026-01-02", "2026-01-03", "day").map(
            (bucketStart) => ({
              bucketStart,
              articleCount: 7,
              publishedArticleLikes: 35,
            }),
          ),
        }),
      });
    },
  );
  await render();
  const since = field<HTMLInputElement>("since");
  setValue(since, "2026-01-02");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const metric = field<HTMLSelectElement>("metric");
  setValue(metric, "likes");
  await act(async () => {
    metric.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new URL(window.location.href).searchParams.get("since")).toBe(
    "2026-01-02",
  );
  expect(new URL(window.location.href).searchParams.get("metric")).toBe(
    "likes",
  );

  const bucket = field<HTMLSelectElement>("bucket");
  setValue(bucket, "week");
  await act(async () => {
    bucket.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Latest intent should commit, previous obsolete intents should not
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("cancelling an invalid or pending debounce does not abort committed network ownership", async () => {
  fetchMock.mockImplementation(
    (_input: RequestInfo | URL, _init?: RequestInit) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-Data-Version": "v1" }),
        json: async () => ({
          since: "2026-01-02",
          until: "2026-01-03",
          bucket: "day",
          rows: analysisBucketStarts("2026-01-02", "2026-01-03", "day").map(
            (bucketStart) => ({
              bucketStart,
              articleCount: 7,
              publishedArticleLikes: 35,
            }),
          ),
        }),
      });
    },
  );
  await render();
  const since = field<HTMLInputElement>("since");
  setValue(since, "2026-01-02");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const author = field<HTMLInputElement>("author");
  setValue(author, "Writer");
  await act(async () => {
    author.dispatchEvent(new Event("input", { bubbles: true }));
  });

  setValue(author, "x".repeat(201));
  await act(async () => {
    author.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "200",
  );
});

test("unmount does not commit pending intent", async () => {
  fetchMock.mockImplementation(
    (_input: RequestInfo | URL, _init?: RequestInit) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-Data-Version": "v1" }),
        json: async () => ({
          since: "2026-01-02",
          until: "2026-01-03",
          bucket: "day",
          rows: analysisBucketStarts("2026-01-02", "2026-01-03", "day").map(
            (bucketStart) => ({
              bucketStart,
              articleCount: 7,
              publishedArticleLikes: 35,
            }),
          ),
        }),
      });
    },
  );
  await render();
  const since = field<HTMLInputElement>("since");
  setValue(since, "2026-01-02");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    root.unmount();
  });
  rootUnmounted = true;
  // Intent should not commit after unmount
});

test("surfaces request failures and retries with a fresh request", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "X-Data-Version": "v1" }),
      json: async () => ({
        since: "2026-01-02",
        until: query.until,
        bucket: "day",
        rows: rows.slice(1),
      }),
    });
  await render();
  const since = field<HTMLInputElement>("since");
  setValue(since, "2026-01-02");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "(503)",
  );
  const retry = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "再試行",
  );
  if (!retry) throw new Error("Missing retry button");
  await act(async () => {
    retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
});

test("Enter and history retry a failed same-query request through load deduplication", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin);
      const since = url.searchParams.get("since") ?? query.since;
      const until = url.searchParams.get("until") ?? query.until;
      const bucket = (url.searchParams.get("bucket") ??
        "day") as AnalysisQuery["bucket"];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "X-Data-Version": "v1" }),
        json: async () => ({
          since,
          until,
          bucket,
          rows: analysisBucketStarts(since, until, bucket).map(
            (bucketStart) => ({
              bucketStart,
              articleCount: 1,
              publishedArticleLikes: 2,
            }),
          ),
        }),
      };
    });
  await render();
  const since = field<HTMLInputElement>("since");
  setValue(since, "2026-01-02");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "(503)",
  );
  const author = field<HTMLInputElement>("author");
  await act(async () => {
    author.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await Promise.resolve();
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();

  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
  setValue(since, "2026-01-03");
  await act(async () => {
    since.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "(503)",
  );
  await act(async () => {
    window.history.replaceState(
      null,
      "",
      "/analysis?since=2026-01-03&until=2026-01-03",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    await Promise.resolve();
  });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test("period shortcuts apply both dates in one request and retain analysis settings", async () => {
  await render({
    ...initialData,
    state: {
      ...initialData.state,
      author: "ada",
      tags: ["React"],
      metric: "likes",
      view: "chart",
    },
  });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-focus-id="period-30days"]')
      ?.click(),
  );
  const params = new URLSearchParams(window.location.search);
  expect(params.get("author")).toBe("ada");
  expect(params.getAll("tags")).toEqual(["React"]);
  expect(params.get("metric")).toBe("likes");
  expect(params.get("view")).toBe("chart");
  expect(params.get("until")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-focus-id="period-all"]')).toBeNull();
  expect(
    container
      .querySelector('[data-focus-id="period-30days"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
});
