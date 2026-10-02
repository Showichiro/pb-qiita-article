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
