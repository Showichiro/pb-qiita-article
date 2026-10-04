import { useCallback, useEffect, useEffectEvent, useMemo, useRef } from "react";
import { useQueryStates, type ParserMap, type inferParserType } from "nuqs";
import { createLoader, createSerializer } from "nuqs/server";

/** URL state is separate from editable drafts and successfully loaded results. */
export function useSearchParams<TParsers extends ParserMap>(
  parsers: TParsers,
  onUrlChange: (params: URLSearchParams, initial: boolean) => void,
) {
  const [values, setValues] = useQueryStates(parsers, { history: "push" });
  const loader = useMemo(() => createLoader(parsers), [parsers]);
  const serialize = useMemo(() => createSerializer(parsers), [parsers]);
  const serialized = serialize(values as inferParserType<TParsers>);
  const params = useMemo(() => new URLSearchParams(serialized), [serialized]);
  const key = JSON.stringify(values);
  const lastObserved = useRef<string | null>(null);
  const changed = useEffectEvent(onUrlChange);

  useEffect(() => {
    if (lastObserved.current === key) return;
    const initial = lastObserved.current === null;
    lastObserved.current = key;
    changed(new URLSearchParams(serialized), initial);
  }, [key, serialized]);

  useEffect(() => {
    // nuqs observes changed parameter values. A history entry with the same
    // values can still be an explicit retry of a failed search.
    const onPop = () => {
      const current = loader(new URLSearchParams(window.location.search));
      if (JSON.stringify(current) === lastObserved.current)
        changed(new URLSearchParams(serialize(current)), false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loader, serialize]);

  const write = useCallback(
    (next: URLSearchParams) => {
      const nextValues = loader(next);
      const nextKey = JSON.stringify(nextValues);
      if (lastObserved.current === nextKey)
        return Promise.resolve(new URLSearchParams(serialize(nextValues)));
      // Local events already load their search. Do not treat nuqs' optimistic
      // state notification as another history navigation or overwrite a draft.
      lastObserved.current = nextKey;
      return setValues(nextValues);
    },
    [loader, serialize, setValues],
  );

  return { params, write };
}
