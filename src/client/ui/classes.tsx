/**
 * Shared presentation class strings for the React island and the Hono SSR
 * fallback. Tailwind scans this file (see tailwind.config.js). Keep every
 * utility as a complete literal so production CSS still includes it.
 * The `.tsx` extension is intentional: Tailwind's content glob scans tsx only.
 */
import { cn } from "./utils";

export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonVariantProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export const buttonBaseClass =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer";

const buttonVariantClass: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-xs hover:opacity-90",
  destructive:
    "bg-destructive text-destructive-foreground shadow-xs hover:opacity-90 focus-visible:ring-destructive/20",
  outline:
    "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
  secondary:
    "bg-secondary text-secondary-foreground shadow-xs hover:opacity-80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
};

const buttonSizeClass: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8 text-base",
  icon: "size-9 p-0",
};

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: ButtonVariantProps = {}): string {
  return cn(
    buttonBaseClass,
    buttonVariantClass[variant],
    buttonSizeClass[size],
    className,
  );
}

export const inputClass =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export const selectWrapperClass = "relative inline-block w-full";
export const selectClass =
  "flex h-9 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
export const selectIconClass =
  "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground";
export const selectChevronClass = "size-4 opacity-50";
export const selectOptionClass = "bg-background text-foreground";
export const selectGroupClass = "bg-background font-semibold text-foreground";

export const cardClass =
  "flex flex-col gap-6 rounded-xl border border-border bg-card py-6 text-card-foreground shadow-sm";
export const cardHeaderClass =
  "grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6";
export const cardTitleClass = "text-lg font-semibold leading-none tracking-tight";
export const cardDescriptionClass = "text-sm text-muted-foreground";
export const cardActionClass =
  "col-start-2 row-span-2 row-start-1 self-start justify-self-end";
export const cardContentClass = "px-6";
export const cardFooterClass = "flex items-center px-6 [.border-t]:pt-6";

export const tableContainerClass = "relative w-full overflow-x-auto";
export const tableClass = "w-full caption-bottom text-sm";
export const tableHeaderClass = "[&_tr]:border-b";
export const tableBodyClass = "[&_tr:last-child]:border-0";
export const tableFooterClass =
  "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0";
export const tableRowClass =
  "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted";
export const tableHeadClass =
  "h-10 px-2 text-left align-middle font-medium text-foreground whitespace-nowrap [&:has([role=checkbox])]:pr-0";
export const tableCellClass =
  "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0";
export const tableCaptionClass = "mt-4 text-sm text-muted-foreground";
