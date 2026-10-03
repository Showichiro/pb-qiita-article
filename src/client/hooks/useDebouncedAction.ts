import { useCallback, useRef, type TransitionStartFunction } from "react";

/**
 * Options for useDebouncedAction
 */
export interface UseDebouncedActionOptions<T> {
  /** Debounce delay in milliseconds */
  intervalMs: number;
  /** React transition function for non-blocking updates */
  startTransition: TransitionStartFunction;
  /** Validation function: returns true if the value is valid and should trigger fetch */
  isValid?: (value: T) => boolean;
  /** Comparison function: returns true if values are equivalent (for deduplication) */
  areEqual?: (a: T, b: T) => boolean;
}

/**
 * Result from useDebouncedAction
 */
export interface DebouncedAction<T> {
  /** Call this on input events to trigger debounced fetch */
  trigger: (value: T) => void;
  /** Immediately flush any pending debounce and fetch */
  flush: () => void;
  /** Cancel any pending debounce without fetching */
  cancel: () => void;
}

/**
 * A reusable event-driven debounce hook for async actions.
 *
 * Unlike useEffect-based debouncing, this hook is event-driven:
 * - Call `trigger()` in onChange/input event handlers
 * - The timer starts on each input, and only the latest quiet period triggers the action
 * - Uses AbortSignal for the debounce cycle and work owned by the action
 * - Integrates with React useTransition for non-blocking pending state
 * - Supports validation and deduplication
 *
 * Key design principles (following uhyo's async-react-debounce-2):
 * - Begin pending on input event (isPending becomes true immediately via outer startTransition)
 * - Latest 500ms quiet timer only starts fetch (debounce delay before action)
 * - Callers wrap state updates after their own awaits in startTransition
 * - No useEffect - all state is event-driven
 * - Owner-triggered cleanup via callback ref pattern (call cancel on unmount)
 *
 * Designed for Phase2 extension to support:
 * - Free-text search with IME composition (helper to detect isComposing - see README)
 * - Numeric bounds validation
 * - Author filtering
 *
 * @example
 * ```tsx
 * const [isPending, startTransition] = useTransition();
 * const { trigger, flush, cancel } = useDebouncedAction(
 *   async (value, signal) => {
 *     const data = await fetch(`/api?q=${value}`, { signal });
 *     startTransition(() => setResult(data));
 *   },
 *   {
 *     intervalMs: 500,
 *     startTransition,
 *     isValid: (val) => val.length > 0,
 *     areEqual: (a, b) => a === b,
 *   }
 * );
 *
 * // Use with callback ref for cleanup
 * const ref = useCallback((node: HTMLElement | null) => {
 *   return () => cancel();
 * }, [cancel]);
 *
 * <input ref={ref} onChange={(e) => trigger(e.target.value)} />
 * <button onClick={flush}>Search now</button>
 * ```
 */
export function useDebouncedAction<T>(
  onAction: (value: T, signal: AbortSignal) => Promise<void> | void,
  options: UseDebouncedActionOptions<T>,
): DebouncedAction<T> {
  const { intervalMs, startTransition, isValid = () => true, areEqual } = options;

  // Track the latest value and active controller
  const stateRef = useRef<{
    latestValue: T | null;
    controller: AbortController | null;
  }>({
    latestValue: null,
    controller: null,
  });

  const trigger = useCallback(
    (value: T) => {
      const { latestValue, controller } = stateRef.current;

      // Deduplicate: if value is unchanged, do nothing
      if (latestValue !== null && areEqual?.(latestValue, value)) {
        return;
      }

      // Cancel previous request
      if (controller !== null) {
        controller.abort();
      }

      // Store latest value
      stateRef.current.latestValue = value;

      // If invalid, clear and don't schedule fetch
      if (!isValid(value)) {
        return;
      }

      // Create new controller for this debounce cycle
      const newController = new AbortController();
      stateRef.current.controller = newController;

      // Start transition immediately to mark pending state
      // This makes isPending true right on input event
      startTransition(async () => {
        const controllerToUse = stateRef.current.controller;
        if (!controllerToUse || controllerToUse.signal.aborted) {
          return;
        }

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let onAbort: (() => void) | null = null;

        try {
          // Wait for debounce period with abort capability
          await new Promise<void>((resolve, reject) => {
            timeoutId = setTimeout(() => resolve(), intervalMs);
            onAbort = () => {
              if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
              }
              reject(new DOMException("Aborted", "AbortError"));
            };
            controllerToUse.signal.addEventListener("abort", onAbort);
          });

          // Check if aborted during wait
          if (controllerToUse.signal.aborted) {
            return;
          }

          // The action receives signal only for debounce timer cancellation
          // Query transport cancellation is not used per Suspense constraints
          await onAction(value, controllerToUse.signal);
        } catch (error) {
          // Ignore abort errors (superseded by newer input)
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }
          // Re-throw other errors
          throw error;
        } finally {
          // Remove timer listener on settle
          if (onAbort !== null && controllerToUse !== null) {
            controllerToUse.signal.removeEventListener("abort", onAbort);
          }
          // Clear controller after action completes
          if (stateRef.current.controller === controllerToUse) {
            stateRef.current.controller = null;
          }
        }
      });
    },
    [intervalMs, startTransition, isValid, areEqual, onAction],
  );

  const flush = useCallback(() => {
    const { controller, latestValue } = stateRef.current;

    // If we have a valid value waiting, execute immediately
    if (latestValue !== null && isValid(latestValue)) {
      const newController = new AbortController();
      stateRef.current.controller = newController;

      // Cancel any existing request
      if (controller !== null) {
        controller.abort();
      }

      startTransition(async () => {
        try {
          await onAction(latestValue, newController.signal);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          throw error;
        } finally {
          if (stateRef.current.controller === newController) {
            stateRef.current.controller = null;
          }
        }
      });
    }
  }, [startTransition, isValid, onAction]);

  const cancel = useCallback(() => {
    const { controller } = stateRef.current;

    if (controller !== null) {
      controller.abort();
      stateRef.current.controller = null;
    }

    stateRef.current.latestValue = null;
  }, []);

  return { trigger, flush, cancel };
}
