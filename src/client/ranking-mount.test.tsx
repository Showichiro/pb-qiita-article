// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { resetTestQueries } from "./test-query-client";
beforeEach(resetTestQueries);
import { mountRankingApp, readDraft, readInitialData } from "./ranking-mount";
import type { RankingInitialData } from "./ranking-mount";
import { defaultRankingQuery } from "./ranking";

const config = { ...defaultRankingQuery };

function element<T>(selector: string): T {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`Missing test element: ${selector}`);
  return found as T;
}

function island() {
  document.body.innerHTML =
    '<div id="ranking-app"><script id="ranking-bootstrap" type="application/json"></script><form action="/ranking" method="get"><input name="since" type="date"><input name="until" type="date"><select name="view"><option value="table">表</option><option value="chart">グラフ</option></select><select name="topN"><option value="10">10件</option></select><button type="submit" data-ranking-action="">検索する</button></form></div>';
  element<HTMLScriptElement>("#ranking-bootstrap").textContent = JSON.stringify(
    {
      config,
      postCounts: [],
      likesCounts: [],
      dataVersion: "v1",
    },
  );
  return element<HTMLDivElement>("#ranking-app");
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.show = function () { this.open = true; };
});

describe("ranking mount", () => {
  it("reads and validates bootstrap query and datasets", () => {
    const container = island();
    expect(readInitialData(container)).toEqual({
      initialConfig: config,
      initialPostCounts: [],
      initialLikesCounts: [],
      initialDataVersion: "v1",
    });
    element<HTMLScriptElement>("#ranking-bootstrap").textContent =
      '{"config":{"since":"","until":"","view":"table","topN":101},"postCounts":[],"likesCounts":[]}';
    expect(() => readInitialData(container)).toThrow(
      "Invalid ranking initial configuration",
    );
  });

  it("reads exact raw dates from the native form before delayed enhancement", () => {
    const container = island();
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing form");
    element<HTMLInputElement>('[name="since"]').value = "2026-02-01";
    element<HTMLInputElement>('[name="until"]').value = "2026-02-28";
    element<HTMLSelectElement>('[name="view"]').value = "chart";
    element<HTMLSelectElement>('[name="topN"]').value = "10";
    expect(readDraft(form, config)).toEqual({
      since: "2026-02-01",
      until: "2026-02-28",
    });
  });

  it("hands off the initial draft and restores focus after a delayed module load", async () => {
    const container = island();
    const since = element<HTMLInputElement>('[name="since"]');
    since.value = "2026-04-01";
    since.dispatchEvent(new Event("input", { bubbles: true }));
    since.focus();
    const module = await import("./RankingApp");
    let finish!: (loaded: { default: typeof module.default }) => void;
    const mounting = mountRankingApp(
      container,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    expect(container.querySelector("form")).not.toBeNull();
    await act(async () => {
      finish({ default: module.default });
      await mounting;
    });
    expect(element<HTMLInputElement>('input[name="since"]').value).toBe(
      "2026-04-01",
    );
    expect(document.activeElement).toBe(
      element<HTMLInputElement>('input[name="since"]'),
    );
    expect(container.querySelector("section.react-island")).not.toBeNull();
  });

  it("moves delayed native submit focus to the noninteractive auto-search hint", async () => {
    const container = island();
    const nativeSubmit = element<HTMLButtonElement>(
      "button[data-ranking-action]",
    );
    nativeSubmit.focus();
    expect(document.activeElement).toBe(nativeSubmit);

    const module = await import("./RankingApp");
    let finish!: (loaded: { default: typeof module.default }) => void;
    const mounting = mountRankingApp(
      container,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      finish({ default: module.default });
      await mounting;
    });

    const hint = element<HTMLElement>("[data-ranking-action]");
    expect(hint.tagName).toBe("FORM");
    expect(hint.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(hint);
    expect(container.querySelector("button[type=submit]")).toBeNull();
  });

  it("preserves SSR content and reports module load failure", async () => {
    const container = island();
    await expect(
      mountRankingApp(container, async () => {
        throw new Error("Ranking chunk unavailable");
      }),
    ).rejects.toThrow("Ranking chunk unavailable");
    expect(container.querySelector("form")?.getAttribute("method")).toBe("get");
    expect(container.querySelector("button[type=submit]")?.textContent).toBe(
      "検索する",
    );
  });

  it("rejects unsafe or malformed bootstrap rows before loading the app", async () => {
    const container = island();
    element<HTMLScriptElement>("#ranking-bootstrap").textContent =
      JSON.stringify({
        config,
        postCounts: [
          { userId: "bad", userName: "Bad", count: Number.POSITIVE_INFINITY },
        ],
        likesCounts: [],
        dataVersion: "v1",
      });
    const load = vi.fn();
    expect(() => readInitialData(container)).toThrow(
      "Invalid ranking post counts initial data",
    );
    await expect(mountRankingApp(container, load)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
    expect(container.querySelector("form")).not.toBeNull();
  });

  it("accepts safe bootstrap datasets and exposes the loaded props", () => {
    const container = island();
    element<HTMLScriptElement>("#ranking-bootstrap").textContent =
      JSON.stringify({
        config: { ...config, view: "chart", topN: 2 },
        postCounts: [{ userId: "a", userName: "A", count: 1 }],
        likesCounts: [{ userId: "a", userName: "A", totalLikesCount: null }],
        dataVersion: "v1",
      });
    const data: RankingInitialData = readInitialData(container);
    expect(data.initialConfig).toEqual({
      ...config,
      view: "chart",
      topN: 2,
    });
    expect(data.initialLikesCounts[0].totalLikesCount).toBeNull();
  });
});
