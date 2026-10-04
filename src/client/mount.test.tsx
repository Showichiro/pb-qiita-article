// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { resetTestQueries } from "./test-query-client";
beforeEach(resetTestQueries);
import { mountArticlesApp, readInitialData } from "./mount";

const config = { limit: 10, offset: 0, since: null, until: null };

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing test element: ${id}`);
  return found;
}

function island() {
  document.body.innerHTML =
    '<div id="articles-app"><a href="/articles">SSR articles</a></div><script id="articles-bootstrap" type="application/json"></script>';
  element("articles-bootstrap").textContent = JSON.stringify({
    dataVersion: "v1",
    config,
    articles: [],
  });
  return element("articles-app");
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.show = function () { this.open = true; };
});

test("reads the JSON bootstrap into initial application props", () => {
  const container = island();
  expect(readInitialData(container)).toEqual({
    initialDataVersion: "v1",
    initialConfig: config,
    initialArticles: [],
  });
});

test("keeps SSR links while the application downloads and swaps after React commits", async () => {
  const container = island();
  let resolve!: (module: { default: () => React.JSX.Element }) => void;
  const module = new Promise<{ default: () => React.JSX.Element }>((done) => {
    resolve = done;
  });
  const mounting = mountArticlesApp(container, () => module);
  expect(container.textContent).toBe("SSR articles");
  await act(async () => {
    resolve({ default: () => <button type="button">Client articles</button> });
    await mounting;
  });
  expect(container.querySelector("button")?.textContent).toBe(
    "Client articles",
  );
  expect(container.querySelector("a")).toBeNull();
});

test("keeps SSR content when the application download fails", async () => {
  const container = island();
  await expect(
    mountArticlesApp(container, async () => {
      throw new Error("Download failed");
    }),
  ).rejects.toThrow("Download failed");
  expect(container.querySelector("a")?.textContent).toBe("SSR articles");
});

test("keeps SSR links when the initial React render throws", async () => {
  const container = island();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(
      act(async () => {
        await mountArticlesApp(container, async () => ({
          default: () => {
            throw new Error("Render failed");
          },
        }));
      }),
    ).resolves.toBeUndefined();
    expect(container.querySelector("a")?.textContent).toBe("SSR articles");
  } finally {
    log.mockRestore();
  }
});

test("keeps SSR content when bootstrap data is malformed", async () => {
  const container = island();
  element("articles-bootstrap").textContent = "{";
  const load = vi.fn();
  await expect(mountArticlesApp(container, load)).rejects.toThrow();
  expect(load).not.toHaveBeenCalled();
  expect(container.querySelector("a")?.textContent).toBe("SSR articles");
});

test("hands off a focused native search button to the automatic-search hint", async () => {
  const container = island();
  container.innerHTML =
    '<form action="/articles" method="get"><div class="flex h-9 w-28 items-center"><button type="submit" data-focus-id="articles-auto-search">検索する</button></div></form>';
  const nativeButton = container.querySelector("button");
  if (!nativeButton) throw new Error("Missing native search button");
  nativeButton.focus();
  const { default: App } = await import("./ArticlesApp");
  let finish!: (module: { default: typeof App }) => void;
  const mounting = mountArticlesApp(
    container,
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  await act(async () => {
    finish({ default: App });
    await mounting;
  });
  const hint = container.querySelector<HTMLElement>(
    "[data-focus-id='articles-auto-search']",
  );
  expect(hint?.tagName).toBe("FORM");
  expect(hint?.getAttribute("tabindex")).toBe("-1");
  expect(document.activeElement).toBe(hint);
  expect(container.querySelector("button[type='submit']")).toBeNull();
});

test("falls back to data attributes when no bootstrap script is provided", () => {
  const container = island();
  element("articles-bootstrap").remove();
  container.dataset.initialConfig = JSON.stringify(config);
  container.dataset.initialArticles = JSON.stringify([]);
  container.dataset.dataVersion = "v1";
  expect(readInitialData(container)).toEqual({
    initialConfig: config,
    initialArticles: [],
    initialDataVersion: "v1",
  });
});

test("requires seeded articles in the native bootstrap or data attributes", () => {
  const container = island();
  element("articles-bootstrap").textContent = JSON.stringify({ config });
  expect(() => readInitialData(container)).toThrow(
    "Invalid articles initial data",
  );
  element("articles-bootstrap").remove();
  container.dataset.initialConfig = JSON.stringify(config);
  container.dataset.dataVersion = "v1";
  delete container.dataset.initialArticles;
  expect(() => readInitialData(container)).toThrow(
    "Invalid articles initial data",
  );
});

test("hands off edits made during download and restores the focused control", async () => {
  const container = island();
  container.innerHTML =
    '<form action="/articles" method="get"><input name="since" type="date"><input name="limit" type="number" value="10"><select name="orderField"><option value="createdAt">Date</option><option value="likesCount">Likes</option></select></form>';
  const { default: App } = await import("./ArticlesApp");
  let finish!: (module: { default: typeof App }) => void;
  const mounting = mountArticlesApp(
    container,
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const date = container.querySelector<HTMLInputElement>('[name="since"]');
  if (!date) throw new Error("Missing date");
  date.value = "2026-01-01";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  date.focus();
  const limit = container.querySelector<HTMLInputElement>('[name="limit"]');
  const select = container.querySelector("select");
  if (!limit || !select) throw new Error("Missing field");
  limit.value = "";
  select.value = "likesCount";
  await act(async () => {
    finish({ default: App });
    await mounting;
  });
  expect(
    container.querySelector<HTMLInputElement>('[name="since"]')?.value,
  ).toBe("2026-01-01");
  expect(
    container.querySelector<HTMLInputElement>('[name="limit"]')?.value,
  ).toBe("");
  expect(
    (
      container.querySelector(
        'select[name="sort"]',
      ) as HTMLSelectElement | null
    )?.value,
  ).toBe("likesCount:desc");
  expect(document.activeElement).toBe(
    container.querySelector('[name="since"]'),
  );
  expect(container.querySelector("section.react-island")).not.toBeNull();
});

test("preserves native form edits that arrive after the handoff snapshot", async () => {
  const container = island();
  container.innerHTML =
    '<form action="/articles" method="get"><input name="since" type="date"></form>';
  const input = container.querySelector("input");
  if (!input) throw new Error("Missing field");
  await act(async () => {
    await mountArticlesApp(container, async () => ({
      default: () => {
        input.value = "2026-02-01";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return <button type="button">Client</button>;
      },
    }));
  });
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("2026-02-01");
  expect(container.querySelector("form")?.getAttribute("method")).toBe("get");
});

test("hands off multiple tag selections, text cursor and all range drafts during delayed import", async () => {
  const container = island();
  element("articles-bootstrap").textContent = JSON.stringify({
    config,
    articles: [],
    tagOptions: ["C#", "a,b"],
    dataVersion: "v1",
  });
  container.innerHTML =
    '<form><input name="q"><input name="author"><input name="minLikes"><input name="maxLikes"><input name="minStocks"><input name="maxStocks"><select name="tags" multiple><option>C#</option><option>a,b</option></select></form>';
  const { default: App } = await import("./ArticlesApp");
  let finish!: (module: { default: typeof App }) => void;
  const mounting = mountArticlesApp(
    container,
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  for (const [name, value] of Object.entries({
    q: "draft keyword",
    author: "writer",
    minLikes: "0",
    maxLikes: "",
    minStocks: "2",
    maxStocks: "30",
  })) {
    const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (!input) throw new Error("Missing input");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const tags = container.querySelector('select[name="tags"]');
  if (!(tags instanceof HTMLSelectElement)) throw new Error("Missing tags");
  for (const option of tags.options) option.selected = true;
  tags.dispatchEvent(new Event("change", { bubbles: true }));
  const keyword = container.querySelector<HTMLInputElement>('[name="q"]');
  if (!keyword) throw new Error("Missing keyword");
  keyword.focus();
  keyword.setSelectionRange(2, 5);
  await act(async () => {
    finish({ default: App });
    await mounting;
  });
  const clientTags = container.querySelector('select[name="tags"]');
  if (!(clientTags instanceof HTMLSelectElement))
    throw new Error("Missing client tags");
  expect(
    Array.from(clientTags.selectedOptions, (option) => option.value),
  ).toEqual(["C#", "a,b"]);
  expect(
    container.querySelector<HTMLInputElement>('[name="maxLikes"]')?.value,
  ).toBe("");
  expect(
    container.querySelector<HTMLInputElement>('[name="minStocks"]')?.value,
  ).toBe("2");
  const clientKeyword = container.querySelector<HTMLInputElement>('[name="q"]');
  if (!clientKeyword) throw new Error("Missing keyword");
  expect(clientKeyword.value).toBe("draft keyword");
  expect(document.activeElement).toBe(clientKeyword);
  expect(clientKeyword.selectionStart).toBe(2);
  expect(clientKeyword.selectionEnd).toBe(5);
});

test("transfers focus from the native multiple tag selector", async () => {
  const container = island();
  element("articles-bootstrap").textContent = JSON.stringify({
    config,
    articles: [],
    tagOptions: ["C#", "a,b"],
    dataVersion: "v1",
  });
  container.innerHTML =
    '<form><select name="tags" multiple><option selected>C#</option><option selected>a,b</option></select></form>';
  const tags = container.querySelector("select");
  if (!tags) throw new Error("Missing tags");
  tags.focus();
  const { default: App } = await import("./ArticlesApp");
  await act(async () =>
    mountArticlesApp(container, async () => ({ default: App })),
  );
  const target = Array.from(container.querySelectorAll("select")).find((select) => select.name === "tags");
  if (!target) throw new Error("Missing client tags");
  expect(document.activeElement).toBe(target);
  expect(target.multiple).toBe(true);
  expect(Array.from(target.selectedOptions, (option) => option.value)).toEqual([
    "C#",
    "a,b",
  ]);
});

test.each([
  ["1e2", 100],
  ["1.0", 1],
  ["+2", 2],
  ["0x10", 16],
] as const)(
  "enhances SSR for raw count syntax %s without throwing or fetching",
  async (raw, expected) => {
    const previousUrl = window.location.href;
    window.history.replaceState(
      null,
      "",
      `/articles?${new URLSearchParams({ minLikes: raw })}`,
    );
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    try {
      const container = island();
      element("articles-bootstrap").textContent = JSON.stringify({
        config: { ...config, minLikes: expected },
        articles: [],
        tagOptions: [],
        dataVersion: "v1",
      });
      container.innerHTML = `<form><input name="minLikes" type="number" value="${expected}"></form>`;
      const { default: App } = await import("./ArticlesApp");
      await act(async () =>
        mountArticlesApp(container, async () => ({ default: App })),
      );
      expect(container.querySelector("section.react-island")).not.toBeNull();
      expect(
        container.querySelector<HTMLInputElement>('[name="minLikes"]')?.value,
      ).toBe(String(expected));
      expect(request).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, "", previousUrl);
      vi.unstubAllGlobals();
    }
  },
);
