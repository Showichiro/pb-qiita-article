/** @jsxImportSource react */
import * as React from "react";
import { cn } from "./utils";

/**
 * Provenance: Hand-authored native Select primitive adhering to shadcn/ui
 * styling and data-slot conventions. Built on the native HTML <select>
 * element for maximum accessibility, mobile UX, and zero runtime dependencies.
 */

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => {
    return (
      <div
        data-slot="select-wrapper"
        className={cn("relative inline-block w-full", wrapperClassName)}
      >
        <select
          ref={ref}
          data-slot="select"
          className={cn(
            "flex h-9 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <span
          data-slot="select-icon"
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <svg
            className="size-4 opacity-50"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Chevron</title>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
    );
  },
);

Select.displayName = "Select";

export interface SelectOptionProps
  extends React.OptionHTMLAttributes<HTMLOptionElement> {}

export const SelectOption = React.forwardRef<
  HTMLOptionElement,
  SelectOptionProps
>(({ className, ...props }, ref) => (
  <option
    ref={ref}
    data-slot="select-option"
    className={cn("bg-background text-foreground", className)}
    {...props}
  />
));

SelectOption.displayName = "SelectOption";

export interface SelectGroupProps
  extends React.OptgroupHTMLAttributes<HTMLOptGroupElement> {}

export const SelectGroup = React.forwardRef<
  HTMLOptGroupElement,
  SelectGroupProps
>(({ className, ...props }, ref) => (
  <optgroup
    ref={ref}
    data-slot="select-group"
    className={cn("bg-background font-semibold text-foreground", className)}
    {...props}
  />
));

SelectGroup.displayName = "SelectGroup";
