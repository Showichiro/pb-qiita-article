/** @jsxImportSource react */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

/** A single form stays mounted, preserving drafts when the sheet closes. */
export function FilterSheet({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const backdropPointer = useRef(false);
  const attachDialog = useCallback((node: HTMLDialogElement | null) => {
    dialog.current = node;
    if (!node) return;
    const media = window.matchMedia?.("(max-width: 639px)");
    const updateViewport = () => {
      if (!media?.matches && node.open) node.close();
      node.setAttribute("role", media?.matches ? "dialog" : "group");
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
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="filter-trigger"
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={open}
        data-focus-id={`${id}-trigger`}
        onClick={() => dialog.current?.showModal()}
      >
        絞り込み・表示設定
      </Button>
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
            <h2 id={`${id}-title`}>絞り込み・表示設定</h2>
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
    </>
  );
}
