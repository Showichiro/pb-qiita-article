// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
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
    config,
    articles: [],
  });
  return element("articles-app");
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

test("reads the JSON bootstrap into initial application props", () => {
  const container = island();
  expect(readInitialData(container)).toEqual({
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
    ).rejects.toThrow("Render failed");
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

test("falls back to data attributes when no bootstrap script is provided", () => {
  const container = island();
  element("articles-bootstrap").remove();
  container.dataset.initialConfig = JSON.stringify(config);
  expect(readInitialData(container)).toEqual({
    initialConfig: config,
    initialArticles: undefined,
  });
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
  expect(container.querySelector("select")?.value).toBe("likesCount");
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
