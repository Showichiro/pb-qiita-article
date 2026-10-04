# React Hooks

## `useDebouncedAction`

An event-driven debounce for async actions. Call `trigger(value)` from an input
handler; the hook cancels the previous debounce cycle and runs the action after
the latest valid value has remained unchanged for `intervalMs`. The supplied
`startTransition` marks the cycle pending while it waits and while the action
runs. No effect is used.

```tsx
const [isPending, startTransition] = useTransition();
const { trigger, flush, cancel } = useDebouncedAction(
  async (value, signal) => {
    const response = await fetch(`/api?q=${encodeURIComponent(value)}`, {
      signal,
    });
    const result = await response.json();
    startTransition(() => setResult(result));
  },
  {
    intervalMs: 500,
    startTransition,
    isValid: (value) => value.length > 0,
    areEqual: (a, b) => a === b,
  },
);
```

`isValid` rejects values before scheduling an action. `areEqual` optionally
deduplicates consecutive equal values. The action receives an `AbortSignal` for
its debounce cycle and can use it to cancel work it owns. Cancelling the hook
cycle does not automatically cancel external work that ignores that signal.

`flush()` runs the latest valid value immediately. `cancel()` aborts the current
cycle, clears the stored value, and does not run the action. Call `cancel()` from
an owner's cleanup, such as a React 19 callback-ref cleanup. In components that
also own committed network requests, manage those requests separately; cancelling
a debounce cycle is not a substitute for aborting them.

The hook awaits the action inside the transition. If the action updates React
state after its own `await`, the action is responsible for wrapping that update
in `startTransition` as required by React 19.

## `useVersionedQuery` and `useRequestIntent`

All three screens share event-driven retrieval through `useVersionedQuery`.
Supply a stable query normalizer, typed `queryTask` list, and commit callback.
The hook prefetches all tasks, checks their cache state (including failed forced
refreshes with previously cached data), and commits only the latest intent.
Failures keep existing results and retain the failed query/version for retry.
Explicit refresh checks metadata first and loads the selected generation before
calling the screen's adoption callback. Shared cached requests remain reusable;
an obsolete intent prevents committing its result without cancelling other
consumers' requests.

`useRequestIntent` provides the stable ref used by loads and draft edits; unmount
invalidates pending intents. Commit/adoption callbacks wrap React updates in a
transition and recheck the intent in state updaters. Query protection survives
prefetch until observers attach, a request fails/is superseded, or unmount.

Call `useRemovePreviousGeneration` after `useSuspenseQuery` /
`useSuspenseQueries` in each screen. Its effect must run after subscription
updates, so the old generation's results are inactive when cleanup runs.
