/** @jsxImportSource react */
import { NuqsAdapter } from "nuqs/adapters/react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
  type Query,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const inactiveDataQueryLimit = 100;
const dataQueryRoots = new Set(["articles", "ranking", "analysis"]);
let browserQueryClient: QueryClient | undefined;

export function QueryProvider({ children }: { children?: ReactNode }) {
  const [client] = useState(getQueryClient);
  return (
    <QueryClientProvider client={client}>
      <NuqsAdapter>{children}</NuqsAdapter>
    </QueryClientProvider>
  );
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

export function useProtectedDataQueries() {
  const client = useQueryClient();
  const releases = useRef(new Set<() => void>());
  useEffect(
    () => () => {
      for (const release of releases.current) release();
      releases.current.clear();
    },
    [],
  );
  return useCallback(
    (keys: readonly (readonly unknown[])[]) => {
      if (
        keys.every(
          (queryKey) =>
            (client
              .getQueryCache()
              .find({ queryKey, exact: true })
              ?.getObserversCount() ?? 0) > 0,
        )
      )
        return () => {};
      const release = protectDataQueries(keys, client, () =>
        releases.current.delete(release),
      );
      releases.current.add(release);
      return release;
    },
    [client],
  );
}

export function protectDataQueries(
  queryKeys: readonly (readonly unknown[])[],
  client = getQueryClient(),
  onRelease?: () => void,
): () => void {
  const cache = client.getQueryCache();
  const protectedKeys = protectedKeysFor(cache);
  const token = Symbol();
  const keys = queryKeys.map((queryKey) => ({
    queryKey,
    hash: JSON.stringify(queryKey),
  }));
  for (const { hash } of keys) {
    const leases = protectedKeys.get(hash) ?? new Set<symbol>();
    leases.add(token);
    protectedKeys.set(hash, leases);
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    unsubscribe();
    for (const { hash } of keys) {
      const leases = protectedKeys.get(hash);
      leases?.delete(token);
      if (leases?.size === 0) protectedKeys.delete(hash);
    }
    onRelease?.();
    trimInactiveDataQueries(cache, protectedKeys);
  };
  const unsubscribe = cache.subscribe((event) => {
    if (
      event.type === "observerAdded" &&
      keys.every(
        ({ queryKey }) =>
          (cache.find({ queryKey, exact: true })?.getObserversCount() ?? 0) > 0,
      )
    )
      release();
  });
  return release;
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

type ProtectedKeys = Map<string, Set<symbol>>;
const protectedKeysByCache = new WeakMap<QueryCache, ProtectedKeys>();
function protectedKeysFor(cache: QueryCache): ProtectedKeys {
  let protectedKeys = protectedKeysByCache.get(cache);
  if (!protectedKeys) {
    protectedKeys = new Map();
    protectedKeysByCache.set(cache, protectedKeys);
  }
  return protectedKeys;
}

function trimInactiveDataQueries(
  cache: QueryCache,
  protectedKeys: ProtectedKeys,
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
    .sort(
      (left, right) => left.state.dataUpdatedAt - right.state.dataUpdatedAt,
    );
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
  queryCache.subscribe((event) => {
    if (event.type === "observerRemoved")
      trimInactiveDataQueries(queryCache, protectedKeysFor(queryCache));
  });
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
