import type { Child, FC } from "hono/jsx";
import { buttonVariants } from "@/client/ui/classes";

/** Native dialog invokers preserve GET search before React starts. */
export const NativeFilterSheet: FC<{ id: string; children: Child }> = ({
  id,
  children,
}) => (
  <>
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
      絞り込み・表示設定
    </button>
    <dialog
      id={id}
      class="filter-sheet"
      aria-labelledby={`${id}-title`}
      closedby="any"
    >
      <div class="filter-sheet-panel">
        <header class="filter-sheet-header">
          <h2 id={`${id}-title`}>絞り込み・表示設定</h2>
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
      </div>
    </dialog>
  </>
);
