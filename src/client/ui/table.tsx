/** @jsxImportSource react */
import * as React from "react";
import {
  tableBodyClass,
  tableCaptionClass,
  tableCellClass,
  tableClass,
  tableContainerClass,
  tableFooterClass,
  tableHeadClass,
  tableHeaderClass,
  tableRowClass,
} from "./classes";
import { cn } from "./utils";

/**
 * Provenance: Adapted from shadcn/ui Table component (new-york style).
 * Native HTML table elements with responsive overflow container,
 * full keyboard/screen reader support, and data-slot attributes.
 */

export interface TableProps
  extends React.TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, ...props }, ref) => {
    return (
      <div
        data-slot="table-container"
        className={cn(tableContainerClass, containerClassName)}
      >
        <table
          ref={ref}
          data-slot="table"
          className={cn(tableClass, className)}
          {...props}
        />
      </div>
    );
  },
);

Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    data-slot="table-header"
    className={cn(tableHeaderClass, className)}
    {...props}
  />
));

TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    data-slot="table-body"
    className={cn(tableBodyClass, className)}
    {...props}
  />
));

TableBody.displayName = "TableBody";

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    data-slot="table-footer"
    className={cn(tableFooterClass, className)}
    {...props}
  />
));

TableFooter.displayName = "TableFooter";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    data-slot="table-row"
    className={cn(tableRowClass, className)}
    {...props}
  />
));

TableRow.displayName = "TableRow";

export interface TableHeadProps
  extends React.ThHTMLAttributes<HTMLTableCellElement> {}

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, scope = "col", ...props }, ref) => (
    <th
      ref={ref}
      scope={scope}
      data-slot="table-head"
      className={cn(tableHeadClass, className)}
      {...props}
    />
  ),
);

TableHead.displayName = "TableHead";

export interface TableCellProps
  extends React.TdHTMLAttributes<HTMLTableCellElement> {}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      data-slot="table-cell"
      className={cn(tableCellClass, className)}
      {...props}
    />
  ),
);

TableCell.displayName = "TableCell";

export const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    data-slot="table-caption"
    className={cn(tableCaptionClass, className)}
    {...props}
  />
));

TableCaption.displayName = "TableCaption";
