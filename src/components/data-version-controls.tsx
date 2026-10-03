import { buttonVariants } from "@/client/ui/classes";

export function NativeDataVersionControls({ href }: { href: string }) {
  return (
    <div data-slot="data-version-controls" aria-live="polite">
      <a
        href={href}
        data-slot="button"
        data-variant="outline"
        data-size="default"
        data-version-action="refresh"
        class={buttonVariants({ variant: "outline" })}
      >
        表示中のデータを更新
      </a>
    </div>
  );
}
