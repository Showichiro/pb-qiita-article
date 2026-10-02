/**
 * Shared React UI Foundation (SHO-105 M1)
 *
 * Accessible, reusable, shadcn/ui-styled UI primitives for incremental React islands.
 * Scoped to `.react-island` and coexists cleanly with Tailwind 4 + daisyUI 5 Hono shell.
 */

import "../ui.css";

export {
  Button,
  buttonVariants,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
  type ButtonVariantProps,
} from "./button";

export { Input, type InputProps } from "./input";

export {
  Select,
  SelectOption,
  SelectGroup,
  type SelectProps,
  type SelectOptionProps,
  type SelectGroupProps,
} from "./select";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  type TableProps,
  type TableHeadProps,
  type TableCellProps,
} from "./table";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "./card";



export { cn, type ClassValue } from "./utils";
