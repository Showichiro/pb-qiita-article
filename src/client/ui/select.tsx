/** @jsxImportSource react */
import * as React from "react";
import {
  selectChevronClass,
  selectClass,
  selectGroupClass,
  selectIconClass,
  selectMultipleClass,
  selectOptionClass,
  selectWrapperClass,
} from "./classes";
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
  ({ className, wrapperClassName, children, multiple, ...props }, ref) => {
    return (
      <div
        data-slot="select-wrapper"
        className={cn(selectWrapperClass, wrapperClassName)}
      >
        <select
          ref={ref}
          data-slot="select"
          className={cn(selectClass, multiple && selectMultipleClass, className)}
          multiple={multiple}
          {...props}
        >
          {children}
        </select>
        {!multiple && (
          <span
            data-slot="select-icon"
            aria-hidden="true"
            className={selectIconClass}
          >
            <svg
              className={selectChevronClass}
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
        )}
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
    className={cn(selectOptionClass, className)}
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
    className={cn(selectGroupClass, className)}
    {...props}
  />
));

SelectGroup.displayName = "SelectGroup";
