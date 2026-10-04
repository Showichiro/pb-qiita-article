import { parseArticleSort } from "./filter-state";
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
  articleQueryParams,
  parseArticleQuery,
  type ArticleQuery,
  type ArticleDraft,
  toArticleDraft,
  configQueryParams,
  commitArticleDraft,
  normalizeTags,
  type rangeFields,
  validateArticleDraft,
} from "./articles";
import {
  queryTask,
  useRequestIntent,
  useVersionedQuery,
} from "./hooks/useVersionedQuery";
import { articleSearchParsers } from "./search-params";
import { useSearchParams } from "./hooks/useSearchParams";
import { articlesQueryOptions, normalizeArticleQuery } from "./queries";
import { isDataQuery, useRemovePreviousGeneration } from "./query-client";
import { useDebouncedAction } from "./hooks/useDebouncedAction";

import type { ArticlesAppProps } from "./ArticlesApp";
export function useArticlesSearch({
  initialConfig,
  initialDataVersion,
  initialDraft,
  initialTagOptions = [],
}: Omit<ArticlesAppProps, "initialArticles">) {
  const [query, setQuery] = useState(() =>
    initialConfig === undefined && typeof window !== "undefined"
      ? parseArticleQuery(new URLSearchParams(window.location.search))
      : parseArticleQuery(configQueryParams(initialConfig ?? {})),
  );
  const requestIntent = useRequestIntent();
  const [isPending, startTransition] = useTransition();
  const commitQuery = useCallback(
    (next: ArticleQuery, intent: number) => {
      startTransition(() =>
        setQuery((current) =>
          requestIntent.current === intent ? next : current,
        ),
      );
    },
    [requestIntent],
  );
  const { versionState, load, requestFailure, retryFailedQuery, refresh } =
    useVersionedQuery({
      initialVersion: initialDataVersion,
      requestIntent,
      normalize: normalizeArticleQuery,
      tasks: articleTasks,
      commit: commitQuery,
      errorMessage: "記事を取得できませんでした",
    });
  const { adoptedVersion } = versionState;
  const queryResult = useSuspenseQuery(
    articlesQueryOptions(adoptedVersion, query),
  );
  const requestQuery = queryResult.data.query;
  const articles = queryResult.data.rows;
  const isFetching = useIsFetching({
    predicate: (activeQuery) =>
      isDataQuery(activeQuery) && activeQuery.queryKey[0] === "articles",
  });
  useRemovePreviousGeneration(adoptedVersion);
  const [draft, setDraft] = useState(
    () => initialDraft ?? toArticleDraft(query),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const tagOptions = normalizeTags([...initialTagOptions, ...draft.tags]);
  const clearTagsQuery = isSearchDraftValid(draft)
    ? commitArticleDraft(draft)
    : query;
  const clearTagsHref = `/articles?${articleQueryParams({
    ...clearTagsQuery,
    tags: [],
    offset: 0,
  })}`;

  // Stable ref for latest draft to avoid stale closures in debounce callback
  const latestDraftRef = useRef<ArticleDraft>(draft);
  const isComposing = useRef(false);

  const { params: urlParams, write } = useSearchParams(
    articleSearchParsers,
    (params, initial) => {
      let current: ArticleQuery;
      try {
        current = parseArticleQuery(params);
      } catch (error) {
        requestIntent.current++;
        if (!initial) debouncedSearch.cancel();
        setValidationError(
          error instanceof Error
            ? error.message
            : "検索条件を確認してください。",
        );
        return;
      }
      if (initial) {
        if (
          articleQueryParams(current).toString() !==
          articleQueryParams(query).toString()
        )
          void load(current);
        return;
      }
      debouncedSearch.cancel();
      const nextDraft = toArticleDraft(current);
      latestDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setValidationError(null);
      void load(current);
    },
  );
  const writeSearchUrl = useCallback(
    (next: ArticleQuery) => {
      void write(articleQueryParams(next));
    },
    [write],
  );

  const runSearch = useCallback(
    async (_scheduledDraft: ArticleDraft, signal: AbortSignal) => {
      if (signal.aborted) return;
      const currentDraft = latestDraftRef.current;
      if (!isSearchDraftValid(currentDraft)) return;
      const next = commitArticleDraft(currentDraft);
      const searchDraft = { ...currentDraft, offset: 0 };
      latestDraftRef.current = searchDraft;
      setDraft(searchDraft);
      setValidationError(null);
      writeSearchUrl(next);
      await load(next);
    },
    [load, writeSearchUrl],
  );
  const debouncedSearch = useDebouncedAction(runSearch, {
    intervalMs: 500,
    startTransition,
    isValid: isSearchDraftValid,
    areEqual: areSearchDraftsEqual,
  });
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch.cancel]);

  const updateDraft = useCallback(
    (field: keyof ArticleDraft, value: string | string[]) => {
      requestIntent.current++;
      const nextDraft = { ...latestDraftRef.current, [field]: value };
      latestDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setValidationError(null);
      return nextDraft;
    },
    [requestIntent],
  );
  const navigate = useCallback(
    (next: ArticleQuery) => {
      debouncedSearch.cancel();
      const nextDraft = toArticleDraft(next);
      latestDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setValidationError(null);
      writeSearchUrl(next);
      void load(next);
    },
    [debouncedSearch.cancel, load, writeSearchUrl],
  );
  const scheduleSearch = useCallback(
    (nextDraft: ArticleDraft, immediate: boolean) => {
      if (!isSearchDraftValid(nextDraft)) {
        debouncedSearch.cancel();
        return;
      }
      let currentUrlQuery: ArticleQuery | null = null;
      try {
        currentUrlQuery = parseArticleQuery(urlParams);
      } catch {
        // A valid edit can replace a malformed history URL.
      }
      if (
        articleQueryParams(commitArticleDraft(nextDraft)).toString() ===
          articleQueryParams(query).toString() &&
        currentUrlQuery !== null &&
        articleQueryParams(commitArticleDraft(nextDraft)).toString() ===
          articleQueryParams(currentUrlQuery).toString() &&
        !requestFailure
      ) {
        debouncedSearch.cancel();
        return;
      }
      if (immediate) {
        navigate(commitArticleDraft(nextDraft));
        return;
      }
      debouncedSearch.trigger(nextDraft);
    },
    [
      debouncedSearch.cancel,
      debouncedSearch.trigger,
      navigate,
      query,
      requestFailure,
      urlParams,
    ],
  );
  const handleTextChange = useCallback(
    (
      field: "q" | "author" | "limit" | (typeof rangeFields)[number],
      value: string,
      composing: boolean,
    ) => {
      const nextDraft = updateDraft(field, value);
      if (composing || isComposing.current) debouncedSearch.cancel();
      else scheduleSearch(nextDraft, false);
    },
    [debouncedSearch.cancel, scheduleSearch, updateDraft],
  );
  const handleImmediateChange = useCallback(
    (
      field: "since" | "until" | "orderField" | "orderDirection" | "tags",
      value: string | string[],
    ) => {
      scheduleSearch(updateDraft(field, value), true);
    },
    [scheduleSearch, updateDraft],
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentDraft = { ...latestDraftRef.current };
    if (!currentDraft.limit.trim()) {
      currentDraft.limit = "10";
      latestDraftRef.current = currentDraft;
      setDraft(currentDraft);
    }
    if (!isSearchDraftValid(currentDraft)) {
      setValidationError(searchDraftError(currentDraft));
      debouncedSearch.cancel();
      return;
    }
    navigate(commitArticleDraft(currentDraft));
  };
  const refreshData = () =>
    refresh(
      () => ({ ...query, offset: 0 }),
      (next, version, intent) => {
        const nextDraft = toArticleDraft(next);
        latestDraftRef.current = nextDraft;
        setValidationError(null);
        writeSearchUrl(next);
        startTransition(() => {
          versionState.setAdoptedVersion((current) =>
            requestIntent.current === intent ? version : current,
          );
          setQuery((current) =>
            requestIntent.current === intent ? next : current,
          );
          setDraft((current) =>
            requestIntent.current === intent ? nextDraft : current,
          );
        });
      },
    );
  const changeFilters = (patch: Record<string, string | string[]>) => {
    const next = { ...latestDraftRef.current, ...patch };
    latestDraftRef.current = next;
    setDraft(next);
    scheduleSearch(next, true);
  };

  const changeShortcut = (range: Pick<typeof draft, "since" | "until">) => {
    requestIntent.current++;
    const next = { ...latestDraftRef.current, ...range };
    latestDraftRef.current = next;
    setDraft(next);
    scheduleSearch(next, true);
  };

  const handleKeyDown = (
    event: import("react").KeyboardEvent<HTMLFormElement>,
  ) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      isComposing.current ||
      !(event.target instanceof HTMLInputElement)
    )
      return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  const startComposition = () => {
    isComposing.current = true;
    debouncedSearch.cancel();
  };
  const endComposition = (name: "q" | "author", value: string) => {
    isComposing.current = false;
    handleTextChange(name, value, false);
  };
  const cancelDebounce = debouncedSearch.cancel;
  const changeSort = (value: string) => {
    const sort = parseArticleSort(value);
    if (!sort) return;
    const next = { ...latestDraftRef.current, ...sort };
    latestDraftRef.current = next;
    setDraft(next);
    scheduleSearch(next, true);
  };
  return {
    requestQuery,
    articles,
    adoptedVersion,
    versionState,
    isFetching,
    isPending,
    refreshData,
    requestFailure,
    retryFailedQuery,
    navigate,
    cancelDebounce,
    form: {
      draft,
      query,
      validationError,
      tagOptions,
      clearTagsHref,
      submit,
      handleTextChange,
      handleImmediateChange,
      changeFilters,
      changeSort,
      changeShortcut,
      handleKeyDown,
      startComposition,
      endComposition,
    },
  };
}
function searchDraftError(draft: ArticleDraft): string | null {
  const filterError = validateArticleDraft(draft);
  if (filterError) return filterError;
  const limit = Number(draft.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    return "表示件数は1から100までの整数で入力してください。";
  if (
    (draft.since && !Number.isFinite(Date.parse(draft.since))) ||
    (draft.until && !Number.isFinite(Date.parse(draft.until)))
  )
    return "投稿日を確認してください。";
  return null;
}

function isSearchDraftValid(draft: ArticleDraft): boolean {
  return searchDraftError(draft) === null;
}

function areSearchDraftsEqual(a: ArticleDraft, b: ArticleDraft): boolean {
  const key = (value: ArticleDraft) =>
    isSearchDraftValid(value)
      ? `valid:${articleQueryParams(commitArticleDraft(value)).toString()}`
      : `invalid:${JSON.stringify(value)}`;
  return key(a) === key(b);
}

function articleTasks(version: string, query: ArticleQuery) {
  return [queryTask(articlesQueryOptions(version, query))];
}
