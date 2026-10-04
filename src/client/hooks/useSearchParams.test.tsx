// @vitest-environment jsdom
/** @jsxImportSource react */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryProvider } from "../query-client";
import { rankingSearchParsers } from "../search-params";
import { flushSearchParams } from "../test-query-client";
import { useSearchParams } from "./useSearchParams";

let root: Root;
let host: HTMLDivElement;
const changed = vi.fn();
function Probe() {
  const { write } = useSearchParams(rankingSearchParsers, changed);
  return (
    <button
      type="button"
      onClick={() => void write(new URLSearchParams("view=chart&topN=2"))}
    >
      Change
    </button>
  );
}
beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
beforeEach(async () => {
  changed.mockClear();
  window.history.replaceState(
    { kept: true },
    "",
    "/ranking?campaign=test#anchor",
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  await flushSearchParams();
  host.remove();
});

test("real Back/Forward restores nuqs state and does not echo local writes as searches", async () => {
  expect(changed).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector("button")?.click());
  await flushSearchParams();
  expect(changed).toHaveBeenCalledTimes(1);
  expect(new URLSearchParams(window.location.search).get("view")).toBe("chart");
  expect(new URLSearchParams(window.location.search).get("campaign")).toBe(
    "test",
  );
  expect(window.location.hash).toBe("#anchor");
  expect(window.history.state).toEqual({ kept: true });
  await act(async () => {
    window.history.back();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  });
  expect(changed.mock.lastCall?.[0].has("view")).toBe(false);
  expect(changed.mock.lastCall?.[1]).toBe(false);
  await act(async () => {
    window.history.forward();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(3));
  });
  expect(changed.mock.lastCall?.[0].get("view")).toBe("chart");
  expect(changed.mock.lastCall?.[0].get("topN")).toBe("2");
});

test("a same-parameter history event remains a retry intent", async () => {
  await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
  expect(changed).toHaveBeenCalledTimes(2);
  expect(changed.mock.lastCall?.[1]).toBe(false);
});

test("Back before a queued write flushes cancels it and does not overwrite navigation", async () => {
  window.history.pushState(
    null,
    "",
    "/ranking?view=table&campaign=test#anchor",
  );
  await act(async () => host.querySelector("button")?.click());
  await act(async () => {
    // Browser navigation can arrive before the throttled History API write.
    window.history.replaceState(
      null,
      "",
      "/ranking?topN=3&campaign=test#anchor",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await flushSearchParams();
  expect(new URLSearchParams(window.location.search).get("topN")).toBe("3");
  expect(new URLSearchParams(window.location.search).has("view")).toBe(false);
  expect(changed.mock.lastCall?.[0].get("topN")).toBe("3");
});
