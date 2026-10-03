/** @jsxImportSource react */
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
  type Query,
} from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

const inactiveDataQueryLimit = 100;
const dataQueryRoots = new Set(["articles", "ranking", "analysis"]);
let browserQueryClient: QueryClient | undefined;

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(getQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return createQueryClient();
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

export function seedQueryData<TData>(
  queryKey: readonly unknown[],
  data: TData,
): void {
  const client = getQueryClient();
  const cache = client.getQueryCache();
  if (client.getQueryData(queryKey) !== undefined) return;
  client.setQueryData(queryKey, data);
  trimInactiveDataQueries(cache, protectedKeysFor(cache));
}

export function isDataQuery(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === "string" && dataQueryRoots.has(root);
}

export function protectDataQueries(
  queryKeys: readonly (readonly unknown[])[],
): () => void {
  const cache = getQueryClient().getQueryCache();
  const protectedKeys = protectedKeysFor(cache);
  const keys = queryKeys.map((queryKey) => ({
    queryKey,
    hash: JSON.stringify(queryKey),
  }));
  for (const { queryKey, hash } of keys) {
    const query = cache.find({ queryKey, exact: true });
    if (!query || query.getObserversCount() === 0) protectedKeys.add(hash);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const { hash } of keys) protectedKeys.delete(hash);
    trimInactiveDataQueries(cache, protectedKeys);
  };
}

export function useRemovePreviousGeneration(adoptedVersion: string): void {
  const client = useQueryClient();
  const previousVersion = useRef(adoptedVersion);
  useEffect(() => {
    const previous = previousVersion.current;
    previousVersion.current = adoptedVersion;
    if (previous === adoptedVersion) return;
    client.removeQueries({
      type: "inactive",
      predicate: (query) =>
        isDataQuery(query) && getQueryVersion(query) === previous,
    });
  }, [adoptedVersion, client]);
}

function getQueryVersion(query: Query): unknown {
  return query.queryKey[0] === "ranking" || query.queryKey[0] === "analysis"
    ? query.queryKey[2]
    : query.queryKey[1];
}

const protectedKeysByCache = new WeakMap<QueryCache, Set<string>>();

function protectedKeysFor(cache: QueryCache): Set<string> {
  const existing = protectedKeysByCache.get(cache);
  if (existing) return existing;
  const protectedKeys = new Set<string>();
  protectedKeysByCache.set(cache, protectedKeys);
  cache.subscribe((event) => {
    if (event.type === "observerAdded") {
      protectedKeys.delete(JSON.stringify(event.query.queryKey));
      trimInactiveDataQueries(cache, protectedKeys);
    }
  });
  return protectedKeys;
}

function trimInactiveDataQueries(
  cache: QueryCache,
  protectedKeys: Set<string>,
): void {
  const inactiveQueries = cache
    .getAll()
    .filter(
      (query) =>
        isDataQuery(query) &&
        query.getObserversCount() === 0 &&
        query.state.fetchStatus === "idle" &&
        !protectedKeys.has(JSON.stringify(query.queryKey)) &&
        query.state.data !== undefined,
    )
    .sort((left, right) => left.state.dataUpdatedAt - right.state.dataUpdatedAt);
  const excess = inactiveQueries.length - inactiveDataQueryLimit;
  if (excess <= 0) return;
  for (const query of inactiveQueries.slice(0, excess)) cache.remove(query);
}

function createQueryClient(): QueryClient {
  const queryCache = new QueryCache({
    onSuccess: () =>
      trimInactiveDataQueries(queryCache, protectedKeysFor(queryCache)),
  });
  protectedKeysFor(queryCache);
  return new QueryClient({
    queryCache,
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 24 * 60 * 60 * 1000,
        retry: false,
      },
    },
  });
}
