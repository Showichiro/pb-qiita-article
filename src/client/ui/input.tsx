/** @jsxImportSource react */
import * as React from "react";
import { inputClass } from "./classes";
import { cn } from "./utils";

/**
 * Provenance: Adapted from shadcn/ui Input component (new-york style).
 * Native HTML input element with data-slot and accessible styling,
 * free of external dependencies and optimized for React 19.
 */

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        data-slot="input"
        className={cn(inputClass, className)}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
