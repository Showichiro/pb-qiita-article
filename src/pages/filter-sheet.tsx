import type { Child, FC } from "hono/jsx";
import { buttonVariants } from "@/client/ui/classes";

/** Native dialog invokers preserve GET search before React starts. */
export const NativeFilterSheet: FC<{
  id: string;
  children: Child;
  search?: Child;
  controls?: Child;
  count?: number;
}> = ({ id, children, search, controls, count = 0 }) => (
  <div class="query-controls">
    <div class="query-toolbar">
      {search}
      <button
        type="button"
        class={buttonVariants({
          variant: "outline",
          className: "filter-trigger",
        })}
        aria-haspopup="dialog"
        aria-controls={id}
        data-focus-id={`${id}-trigger`}
        commandfor={id}
        command="show-modal"
      >
        絞り込み{count > 0 && <span class="filter-count">{count}</span>}
      </button>
      <fieldset class="query-display-controls" aria-label="表示設定">
        {controls}
      </fieldset>
    </div>
    <dialog
      id={id}
      class="filter-sheet"
      aria-labelledby={`${id}-title`}
      closedby="any"
    >
      <div class="filter-sheet-panel">
        <header class="filter-sheet-header">
          <h2 id={`${id}-title`}>絞り込み</h2>
          <button
            type="button"
            autofocus
            class={buttonVariants({ variant: "ghost" })}
            data-focus-id={`${id}-close`}
            commandfor={id}
            command="close"
          >
            閉じる
          </button>
        </header>
        <div class="filter-sheet-content">{children}</div>
        <div class="filter-sheet-footer">
          <button type="submit" form={`${id}-form`} class={buttonVariants()}>
            適用
          </button>
        </div>
      </div>
    </dialog>
  </div>
);
