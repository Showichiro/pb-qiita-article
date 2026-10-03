// @vitest-environment jsdom
import { QueryObserver } from "@tanstack/react-query";
import {
  getQueryClient,
  protectDataQueries,
  seedQueryData,
} from "./query-client";

beforeEach(() => getQueryClient().clear());
afterEach(() => getQueryClient().clear());

it("bounds inactive results at 100 while preserving an observed query", () => {
  const client = getQueryClient();
  const key = ["articles", "v1", { q: "active" }];
  seedQueryData(key, []);
  const observer = new QueryObserver(client, { queryKey: key, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  for (let i = 0; i < 120; i++)
    seedQueryData(["articles", "v1", { q: String(i) }], []);
  expect(client.getQueryData(key)).toEqual([]);
  expect(
    client
      .getQueryCache()
      .getAll()
      .filter((query) => query.getObserversCount() === 0),
  ).toHaveLength(100);
  unsubscribe();
  expect(client.getQueryCache().getAll()).toHaveLength(100);
});

it("keeps overlapping prefetch protections until both callers release", () => {
  const key = ["analysis", "time-series", "v1", { author: "protected" }];
  const first = protectDataQueries([key]);
  const second = protectDataQueries([key]);
  seedQueryData(key, []);
  for (let i = 0; i < 120; i++)
    seedQueryData(["articles", "v1", { q: String(i) }], []);
  first();
  first();
  expect(getQueryClient().getQueryData(key)).toEqual([]);
  second();
  expect(getQueryClient().getQueryCache().getAll()).toHaveLength(100);
  expect(getQueryClient().getQueryData(key)).toBeUndefined();
});
