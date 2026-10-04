import {
  useCallback,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useIsFetching, useSuspenseQueries } from "@tanstack/react-query";
import {
  parseRankingQuery,
  rankingQueryParams,
  rankingRequestKey,
  toRankingDraft,
  type RankingQuery,
  type RankingRequestQuery,
  validateRankingDraft,
  commitRankingDraft,
  withRankingDisplay,
} from "./ranking";
import {
  queryTask,
  useRequestIntent,
  useVersionedQuery,
} from "./hooks/useVersionedQuery";
import { rankingSearchParsers } from "./search-params";
import { useSearchParams } from "./hooks/useSearchParams";
import { rankingLikesQueryOptions, rankingPostsQueryOptions } from "./queries";
import { isDataQuery, useRemovePreviousGeneration } from "./query-client";

import type { RankingAppProps } from "./RankingApp";
export function useRankingSearch({
  initialConfig,
  initialDataVersion,
  initialDraft,
}: Omit<RankingAppProps, "initialPostCounts" | "initialLikesCounts">) {
  const [query, setQuery] = useState(initialConfig);
  const queryRef = useRef(query);
  const requestIntent = useRequestIntent();
  const [isPending, startTransition] = useTransition();
  const setCurrentQuery = useCallback(
    (next: RankingQuery, intent?: number) => {
      if (intent !== undefined && requestIntent.current !== intent) return;
      queryRef.current = next;
      setQuery((current) =>
        intent === undefined || requestIntent.current === intent
          ? next
          : current,
      );
    },
    [requestIntent],
  );

  const commitQuery = useCallback(
    (next: RankingQuery, intent: number) => {
      startTransition(() =>
        setCurrentQuery(
          withRankingDisplay(dateQuery(next), queryRef.current),
          intent,
        ),
      );
    },
    [setCurrentQuery],
  );
  const { versionState, load, requestFailure, retryFailedQuery, refresh } =
    useVersionedQuery({
      initialVersion: initialDataVersion,
      requestIntent,
      normalize: normalizeRankingLoad,
      tasks: rankingTasks,
      commit: commitQuery,
      errorMessage: "ランキングを取得できませんでした",
    });
  const { adoptedVersion } = versionState;
  const dates = dateQuery(query);
  const queryResults = useSuspenseQueries({
    queries: [
      rankingPostsQueryOptions(adoptedVersion, dates),
      rankingLikesQueryOptions(adoptedVersion, dates),
    ],
  });
  const data = {
    postCounts: queryResults[0].data.rows,
    likesCounts: queryResults[1].data.rows,
  };
  const resultQuery = queryResults[0].data.query;
  const isFetching = useIsFetching({
    predicate: (activeQuery) =>
      isDataQuery(activeQuery) && activeQuery.queryKey[0] === "ranking",
  });
  useRemovePreviousGeneration(adoptedVersion);
  const [draft, setDraft] = useState(
    () => initialDraft ?? toRankingDraft(initialConfig),
  );
  const latestDraft = useRef(draft);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { write } = useSearchParams(rankingSearchParsers, (params, initial) => {
    let next: RankingQuery;
    try {
      next = parseRankingQuery(params);
    } catch (error) {
      requestIntent.current++;
      setValidationError(
        error instanceof Error ? error.message : "検索条件を確認してください",
      );
      return;
    }
    if (
      initial &&
      rankingQueryParams(next).toString() ===
        rankingQueryParams(initialConfig).toString()
    )
      return;
    const sameDates = rankingRequestKey(next) === rankingRequestKey(query);
    queryRef.current = next;
    const nextDraft = toRankingDraft(next);
    latestDraft.current = nextDraft;
    setDraft(nextDraft);
    setValidationError(null);
    if (sameDates) setCurrentQuery(next, ++requestIntent.current);
    else {
      setQuery((current) =>
        withRankingDisplay(dateQuery(current), {
          view: next.view,
          topN: next.topN,
        }),
      );
      void load(next);
    }
  });
  const writeSearchUrl = useCallback(
    (next: RankingQuery) => {
      void write(rankingQueryParams(next));
    },
    [write],
  );

  const navigateDates = useCallback(
    (nextDates: RankingRequestQuery) => {
      const next = withRankingDisplay(nextDates, {
        view: queryRef.current.view,
        topN: queryRef.current.topN,
      });
      queryRef.current = next;
      setValidationError(null);
      writeSearchUrl(next);
      void load(next);
    },
    [load, writeSearchUrl],
  );

  const changeDisplay = useCallback(
    (display: Pick<RankingQuery, "view" | "topN">) => {
      const next = withRankingDisplay(dateQuery(queryRef.current), display);
      queryRef.current = next;
      setQuery((current) => withRankingDisplay(dateQuery(current), display));
      writeSearchUrl(next);
    },
    [writeSearchUrl],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentDraft = { ...latestDraft.current };
    const error = validateRankingDraft(currentDraft);
    if (error) {
      setValidationError(error);
      return;
    }
    navigateDates(commitRankingDraft(currentDraft));
  };

  const handleDateChange = (field: "since" | "until", value: string) => {
    const nextDraft = { ...latestDraft.current, [field]: value };
    latestDraft.current = nextDraft;
    setDraft(nextDraft);
    setValidationError(null);
    if (validateRankingDraft(nextDraft) === null)
      navigateDates(commitRankingDraft(nextDraft));
  };
  const refreshData = () =>
    refresh(
      () => {
        const next = { ...queryRef.current };
        latestDraft.current = toRankingDraft(next);
        setValidationError(null);
        return next;
      },
      (next, version, intent) => {
        startTransition(() => {
          versionState.setAdoptedVersion((current) =>
            requestIntent.current === intent ? version : current,
          );
          setCurrentQuery(next, intent);
          setDraft((current) =>
            requestIntent.current === intent ? latestDraft.current : current,
          );
        });
      },
    );
  const changePeriod = (patch: Record<string, string | string[]>) => {
    const next = { ...latestDraft.current, ...patch };
    latestDraft.current = next;
    setDraft(next);
    const error = validateRankingDraft(next);
    setValidationError(error);
    if (!error) navigateDates(commitRankingDraft(next));
  };
  const result = { query: resultQuery, data };

  const changeShortcut = (range: Pick<typeof draft, "since" | "until">) => {
    const next = { ...latestDraft.current, ...range };
    latestDraft.current = next;
    setDraft(next);
    const error = validateRankingDraft(next);
    setValidationError(error);
    if (!error) navigateDates(commitRankingDraft(next));
  };

  const changeView = (view: RankingQuery["view"]) =>
    changeDisplay({ view, topN: queryRef.current.topN });
  const changeTopN = (topN: number) =>
    changeDisplay({ view: queryRef.current.view, topN });
  return {
    query,
    result,
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
      handleSubmit,
      handleDateChange,
      changeView,
      changeTopN,
      changePeriod,
      changeShortcut,
    },
  };
}
function normalizeRankingLoad(query: RankingQuery): RankingQuery {
  return query;
}
function rankingTasks(version: string, query: RankingQuery) {
  return [
    queryTask(rankingPostsQueryOptions(version, dateQuery(query))),
    queryTask(rankingLikesQueryOptions(version, dateQuery(query))),
  ];
}

function dateQuery(query: RankingRequestQuery): RankingRequestQuery {
  return { since: query.since, until: query.until };
}
