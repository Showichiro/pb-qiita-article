import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useIsFetching, useSuspenseQuery } from "@tanstack/react-query";
import {
  analysisDraftError,
  analysisQueryParams,
  analysisStateParams,
  commitAnalysisDraft,
  normalizeAnalysisTags,
  parseAnalysisState,
  toAnalysisDraft,
  type AnalysisDraft,
  type AnalysisMetric,
  type AnalysisQuery,
  type AnalysisView,
} from "./analysis";
import {
  queryTask,
  useRequestIntent,
  useVersionedQuery,
} from "./hooks/useVersionedQuery";
import { analysisSearchParsers } from "./search-params";
import { useSearchParams } from "./hooks/useSearchParams";
import { analysisQueryOptions, normalizeAnalysisQuery } from "./queries";
import { isDataQuery, useRemovePreviousGeneration } from "./query-client";
import { useDebouncedAction } from "./hooks/useDebouncedAction";

import type { AnalysisAppProps } from "./AnalysisApp";
export function useAnalysisSearch({
  initialData,
  initialDraft,
  initialMetric,
  initialView,
}: AnalysisAppProps) {
  const initialQuery: AnalysisQuery = {
    since: initialData.state.since,
    until: initialData.state.until,
    bucket: initialData.state.bucket,
    author: initialData.state.author,
    tags: [...initialData.state.tags],
  };
  const [query, setQuery] = useState(initialQuery);
  const requestIntent = useRequestIntent();
  const [isPending, startTransition] = useTransition();
  const acceptedQuery = useRef(initialQuery);
  const commitQuery = useCallback(
    (next: AnalysisQuery, intent: number) => {
      startTransition(() => {
        if (requestIntent.current !== intent) return;
        acceptedQuery.current = next;
        setQuery((current) =>
          requestIntent.current === intent ? next : current,
        );
      });
    },
    [requestIntent],
  );
  const { versionState, load, requestFailure, retryFailedQuery, refresh } =
    useVersionedQuery({
      initialVersion: initialData.dataVersion,
      requestIntent,
      normalize: normalizeAnalysisQuery,
      tasks: analysisTasks,
      commit: commitQuery,
      errorMessage: "時系列データを取得できませんでした",
    });
  const { adoptedVersion } = versionState;
  const queryResult = useSuspenseQuery(
    analysisQueryOptions(adoptedVersion, query),
  );
  const requestQuery = queryResult.data.query;
  const rows = queryResult.data.rows;
  const isFetching = useIsFetching({
    predicate: (activeQuery) =>
      isDataQuery(activeQuery) && activeQuery.queryKey[0] === "analysis",
  });
  useRemovePreviousGeneration(adoptedVersion);
  const [draft, setDraft] = useState(
    () => initialDraft ?? toAnalysisDraft(initialQuery),
  );
  const latestDraft = useRef(draft);
  const bootstrapClock = useRef(
    new Date(`${initialData.state.until}T12:00:00.000Z`),
  ).current;
  const [metric, setMetric] = useState(
    () => initialMetric ?? initialData.state.metric,
  );
  const [view, setView] = useState(() => initialView ?? initialData.state.view);
  const composingRef = useRef(false);
  const [validationError, setValidationError] = useState<string | null>(() =>
    analysisDraftError(draft),
  );

  const { write } = useSearchParams(
    analysisSearchParsers,
    (params, initial) => {
      const state = parseAnalysisState(params, bootstrapClock);
      if (initial) return;
      debouncedSearch.cancel();
      const error = analysisDraftError(state);
      if (error) {
        requestIntent.current++;
        setValidationError(error);
        return;
      }
      const next: AnalysisQuery = {
        since: state.since,
        until: state.until,
        bucket: state.bucket,
        author: state.author,
        tags: state.tags,
      };
      acceptedQuery.current = next;
      const nextDraft = toAnalysisDraft(next);
      latestDraft.current = nextDraft;
      setDraft(nextDraft);
      setMetric(state.metric);
      setView(state.view);
      setValidationError(null);
      void load(next);
    },
  );
  const writeUrl = useCallback(
    (
      query: AnalysisQuery,
      nextMetric: AnalysisMetric,
      nextView: AnalysisView,
    ) => {
      void write(
        analysisStateParams({ ...query, metric: nextMetric, view: nextView }),
      );
    },
    [write],
  );

  const acceptDraft = useCallback(
    async (nextDraft: AnalysisDraft, signal?: AbortSignal) => {
      if (signal?.aborted) return false;
      const query = commitAnalysisDraft(nextDraft);
      latestDraft.current = toAnalysisDraft(query);
      setDraft(latestDraft.current);
      setValidationError(null);
      writeUrl(query, metric, view);
      return load(query);
    },
    [load, metric, view, writeUrl],
  );

  const runDebouncedSearch = useCallback(
    async (_scheduledDraft: AnalysisDraft, signal: AbortSignal) => {
      if (signal.aborted) return;
      const currentDraft = latestDraft.current;
      if (analysisDraftError(currentDraft)) return;
      await acceptDraft(currentDraft, signal);
    },
    [acceptDraft],
  );
  const debouncedSearch = useDebouncedAction(runDebouncedSearch, {
    intervalMs: 500,
    startTransition,
    isValid: (value) => analysisDraftError(value) === null,
    areEqual: (a, b) =>
      analysisDraftError(a) === null &&
      analysisDraftError(b) === null &&
      analysisQueryParams(commitAnalysisDraft(a)).toString() ===
        analysisQueryParams(commitAnalysisDraft(b)).toString(),
  });

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch.cancel]);

  const updateDraft = useCallback(
    (field: keyof AnalysisDraft, value: string | string[]) => {
      requestIntent.current++;
      const next = { ...latestDraft.current, [field]: value };
      latestDraft.current = next;
      setDraft(next);
      setValidationError(analysisDraftError(next));
      return next;
    },
    [requestIntent],
  );

  const scheduleSearch = useCallback(
    (next: AnalysisDraft, immediate: boolean) => {
      const error = analysisDraftError(next);
      setValidationError(error);
      if (error) {
        debouncedSearch.cancel();
        return;
      }
      if (immediate) {
        debouncedSearch.cancel();
        acceptDraft(next);
      } else {
        debouncedSearch.trigger(next);
      }
    },
    [acceptDraft, debouncedSearch.cancel, debouncedSearch.trigger],
  );

  const handleAuthorChange = useCallback(
    (value: string, composing: boolean) => {
      const next = updateDraft("author", value);
      if (composing || composingRef.current) debouncedSearch.cancel();
      else scheduleSearch(next, false);
    },
    [debouncedSearch.cancel, scheduleSearch, updateDraft],
  );

  const handleImmediateChange = useCallback(
    (field: "since" | "until" | "bucket" | "tags", value: string | string[]) =>
      scheduleSearch(updateDraft(field, value), true),
    [scheduleSearch, updateDraft],
  );

  const setDisplay = useCallback(
    (nextMetric: AnalysisMetric, nextView: AnalysisView) => {
      setMetric(nextMetric);
      setView(nextView);
      writeUrl(acceptedQuery.current, nextMetric, nextView);
    },
    [writeUrl],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = latestDraft.current;
    const error = analysisDraftError(current);
    setValidationError(error);
    if (error) {
      debouncedSearch.cancel();
      return;
    }
    debouncedSearch.cancel();
    acceptDraft(current);
  };

  const tagOptions = normalizeAnalysisTags([
    ...initialData.tagOptions,
    ...draft.tags,
  ]);
  const clearTagsQuery =
    analysisDraftError(draft) === null
      ? commitAnalysisDraft(draft)
      : acceptedQuery.current;
  const clearTagsHref = `/analysis?${analysisStateParams({
    ...clearTagsQuery,
    tags: [],
    metric,
    view,
  })}`;
  const refreshData = () =>
    refresh(
      () => query,
      (next, version, intent) => {
        writeUrl(next, metric, view);
        startTransition(() => {
          if (requestIntent.current !== intent) return;
          versionState.setAdoptedVersion((current) =>
            requestIntent.current === intent ? version : current,
          );
          acceptedQuery.current = next;
          setQuery((current) =>
            requestIntent.current === intent ? next : current,
          );
        });
      },
    );
  const changeFilters = (patch: Record<string, string | string[]>) => {
    const next = { ...latestDraft.current, ...patch };
    latestDraft.current = next;
    setDraft(next);
    scheduleSearch(next, true);
  };

  const changeShortcut = (range: Pick<typeof draft, "since" | "until">) => {
    requestIntent.current++;
    const next = { ...latestDraft.current, ...range };
    latestDraft.current = next;
    setDraft(next);
    scheduleSearch(next, true);
  };

  const handleKeyDown = (
    event: import("react").KeyboardEvent<HTMLFormElement>,
  ) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      composingRef.current ||
      !(event.target instanceof HTMLInputElement)
    )
      return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  const startComposition = () => {
    composingRef.current = true;
    debouncedSearch.cancel();
  };
  const endComposition = (value: string) => {
    composingRef.current = false;
    handleAuthorChange(value, false);
  };
  return {
    requestQuery,
    rows,
    metric,
    view,
    versionState,
    isFetching,
    isPending,
    refreshData,
    requestFailure,
    retryFailedQuery,
    form: {
      draft,
      query,
      validationError,
      tagOptions,
      clearTagsHref,
      metric,
      view,
      submit,
      handleAuthorChange,
      handleImmediateChange,
      setDisplay,
      changeFilters,
      changeShortcut,
      handleKeyDown,
      startComposition,
      endComposition,
    },
  };
}
function analysisTasks(version: string, query: AnalysisQuery) {
  return [queryTask(analysisQueryOptions(version, query))];
}
