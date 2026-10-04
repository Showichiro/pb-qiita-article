/** @jsxImportSource react */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

/** A single form stays mounted, preserving drafts when the sheet closes. */
export function FilterSheet({
  id,
  children,
  search,
  controls,
  count = 0,
}: {
  id: string;
  children: ReactNode;
  search?: ReactNode;
  controls?: ReactNode;
  count?: number;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const backdropPointer = useRef(false);
  const attachDialog = useCallback((node: HTMLDialogElement | null) => {
    dialog.current = node;
    if (!node) return;
    const media = window.matchMedia?.("(max-width: 639px)");
    let mobile = media?.matches ?? false;
    const updateViewport = () => {
      const nextMobile = media?.matches ?? false;
      if (nextMobile !== mobile && node.open) node.close();
      mobile = nextMobile;
      node.setAttribute("role", mobile ? "dialog" : "group");
    };
    updateViewport();
    media?.addEventListener("change", updateViewport);
    return () => {
      media?.removeEventListener("change", updateViewport);
      if (node.open) node.close();
      dialog.current = null;
    };
  }, []);
  const close = () => dialog.current?.close();
  const toggle = () => {
    const node = dialog.current;
    if (!node) return;
    if (node.open) node.close();
    else if (window.matchMedia?.("(max-width: 639px)").matches)
      node.showModal();
    else node.show();
  };
  return (
    <div className="query-controls">
      <div className="query-toolbar">
        {search}
        <Button
          type="button"
          variant="outline"
          className="filter-trigger"
          aria-controls={id}
          aria-expanded={open}
          data-focus-id={`${id}-trigger`}
          onClick={toggle}
        >
          絞り込み{count > 0 && <span className="filter-count">{count}</span>}
        </Button>
        <fieldset className="query-display-controls" aria-label="表示設定">
          {controls}
        </fieldset>
      </div>
      <dialog
        ref={attachDialog}
        id={id}
        className="filter-sheet"
        aria-labelledby={`${id}-title`}
        closedby="closerequest"
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          backdropPointer.current =
            event.target === event.currentTarget &&
            (event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom);
        }}
        onPointerCancel={() => {
          backdropPointer.current = false;
        }}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const outside =
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom;
          if (
            backdropPointer.current &&
            event.target === event.currentTarget &&
            outside
          )
            close();
          backdropPointer.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        onClose={() => setOpen(false)}
      >
        <div className="filter-sheet-panel">
          <header className="filter-sheet-header">
            <h2 id={`${id}-title`}>絞り込み</h2>
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              autoFocus
              data-focus-id={`${id}-close`}
            >
              閉じる
            </Button>
          </header>
          <div className="filter-sheet-content">{children}</div>
        </div>
      </dialog>
    </div>
  );
}
