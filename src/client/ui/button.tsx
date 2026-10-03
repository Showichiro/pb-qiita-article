/** @jsxImportSource react */
import * as React from "react";
import {
  buttonVariants,
  type ButtonSize,
  type ButtonVariant,
  type ButtonVariantProps,
} from "./classes";

/**
 * Provenance: Adapted from shadcn/ui Button component (new-york style).
 * Hand-authored variant mapper for native HTML button without
 * class-variance-authority or Radix Slot dependencies, optimized for React 19.
 */

export {
  buttonVariants,
  type ButtonSize,
  type ButtonVariant,
  type ButtonVariantProps,
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={buttonVariants({ variant, size, className })}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
