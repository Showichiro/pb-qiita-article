import { useCallback, useEffect, useRef, useState } from "react";
import {
  useQueryClient,
  type FetchQueryOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useDataVersion } from "../data-version";
import { useProtectedDataQueries } from "../query-client";

export function useRequestIntent() {
  const intent = useRef(0);
  useEffect(
    () => () => {
      intent.current++;
    },
    [],
  );
  return intent;
}

type QueryTask = {
  queryKey: QueryKey;
  prefetch: (client: QueryClient, force: boolean) => Promise<void>;
  error: (client: QueryClient, force: boolean) => Error | null;
};

// Keep each dataset's type at the boundary, including ranking's two datasets.
export function queryTask<TData, TKey extends QueryKey>(
  options: FetchQueryOptions<TData, Error, TData, TKey>,
): QueryTask {
  return {
    queryKey: options.queryKey,
    prefetch: (client, force) =>
      client.prefetchQuery(force ? { ...options, staleTime: 0 } : options),
    error: (client, force) => {
      const state = client.getQueryState(options.queryKey);
      return client.getQueryData(options.queryKey) === undefined ||
        (force && state?.status === "error")
        ? (state?.error ?? new Error("データを取得できませんでした"))
        : null;
    },
  };
}

type LoadOptions = {
  version?: string;
  force?: boolean;
  commit?: boolean;
  intent?: number;
  onSuccess?: (intent: number) => void;
};

export function useVersionedQuery<TQuery>({
  initialVersion,
  requestIntent,
  normalize,
  tasks,
  commit,
  errorMessage,
}: {
  initialVersion: string;
  requestIntent: ReturnType<typeof useRequestIntent>;
  normalize: (query: TQuery) => TQuery;
  tasks: (version: string, query: TQuery) => QueryTask[];
  commit: (query: TQuery, intent: number) => void;
  errorMessage: string;
}) {
  const versionState = useDataVersion(initialVersion);
  const { adoptedVersion } = versionState;
  const client = useQueryClient();
  const protect = useProtectedDataQueries();
  const [requestFailure, setRequestFailure] = useState<{
    error: Error;
    query: TQuery;
    version: string;
  } | null>(null);

  const load = useCallback(
    async (next: TQuery, options: LoadOptions = {}) => {
      const query = normalize(next);
      const version = options.version ?? adoptedVersion;
      const intent = options.intent ?? ++requestIntent.current;
      setRequestFailure(null);
      const requests = tasks(version, query);
      const release = protect(requests.map((request) => request.queryKey));
      try {
        await Promise.all(
          requests.map((request) => request.prefetch(client, !!options.force)),
        );
        for (const request of requests) {
          const error = request.error(client, !!options.force);
          if (error) throw error;
        }
        if (requestIntent.current !== intent) {
          release();
          return false;
        }
        if (options.onSuccess) options.onSuccess(intent);
        else if (options.commit !== false) commit(query, intent);
        // Protection lasts until the committed query gains an observer, or unmount.
        return true;
      } catch (error) {
        release();
        if (requestIntent.current !== intent) return false;
        const normalizedError =
          error instanceof Error ? error : new Error(errorMessage);
        setRequestFailure({ error: normalizedError, query, version });
        versionState.reportError(normalizedError);
        return false;
      }
    },
    [
      normalize,
      adoptedVersion,
      requestIntent,
      tasks,
      protect,
      client,
      commit,
      errorMessage,
      versionState.reportError,
    ],
  );

  const retryFailedQuery = useCallback(() => {
    if (requestFailure)
      void load(requestFailure.query, {
        version: requestFailure.version,
        force: true,
      });
  }, [load, requestFailure]);

  const refresh = useCallback(
    async (
      next: () => TQuery,
      onSuccess: (query: TQuery, version: string, intent: number) => void,
    ) => {
      const intent = ++requestIntent.current;
      let version: string;
      try {
        version = await versionState.checkLatestVersion();
      } catch (error) {
        versionState.reportError(error);
        return false;
      }
      if (requestIntent.current !== intent) return false;
      const query = next();
      return load(query, {
        version,
        force: true,
        commit: false,
        intent,
        onSuccess: (request) => onSuccess(query, version, request),
      });
    },
    [
      load,
      requestIntent,
      versionState.checkLatestVersion,
      versionState.reportError,
    ],
  );

  return { versionState, load, requestFailure, retryFailedQuery, refresh };
}
