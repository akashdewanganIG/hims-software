"use client";

import * as React from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 12;

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | undefined;
  align?: "left" | "right" | "center";
  width?: string;
  /** Hidden until the user switches it on in the Columns menu. */
  defaultHidden?: boolean;
  className?: string;
}

const alignClass = (align?: Column<unknown>["align"]) =>
  align === "right"
    ? "text-right"
    : align === "center"
      ? "text-center"
      : "text-left";

/**
 * Operational table in the Ralli Wolf SimpleTable language: sticky
 * uppercase header, 44px rows, skeleton rows while loading, and client-side
 * sorting, pagination and column visibility.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  isLoading = false,
  empty = "Nothing to show",
  onRowClick,
  rowClassName,
  pageSize = DEFAULT_PAGE_SIZE,
  initialSort,
  toolbar,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  isLoading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  pageSize?: number;
  initialSort?: { id: string; direction: "asc" | "desc" };
  /** Search, filters or view tabs, shown left of the Columns control. */
  toolbar?: React.ReactNode;
}) {
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter(c => c.defaultHidden).map(c => c.id))
  );
  const [sort, setSort] = React.useState(initialSort);
  const [page, setPage] = React.useState(1);

  const visible = columns.filter(c => !hidden.has(c.id));

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const column = columns.find(c => c.id === sort.id);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av === bv) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return (av < bv ? -1 : 1) * factor;
    });
  }, [rows, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  React.useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    setSort(current =>
      current?.id !== column.id
        ? { id: column.id, direction: "asc" }
        : current.direction === "asc"
          ? { id: column.id, direction: "desc" }
          : undefined
    );
  };

  return (
    <div className="min-w-0">
      {toolbar ? (
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {toolbar}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 self-end md:self-auto"
              >
                <Columns className="size-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map(column => {
                const isVisible = !hidden.has(column.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={isVisible}
                    disabled={isVisible && visible.length === 1}
                    onSelect={event => event.preventDefault()}
                    onCheckedChange={checked =>
                      setHidden(current => {
                        const next = new Set(current);
                        if (checked) next.delete(column.id);
                        else next.add(column.id);
                        return next;
                      })
                    }
                  >
                    {column.header || column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <div
        className="max-w-full overflow-x-auto overscroll-x-contain"
        aria-busy={isLoading || undefined}
      >
        <table className="w-full min-w-[45rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle">
              {visible.map(column => {
                const active = sort?.id === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={
                      active
                        ? sort?.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "sticky top-0 z-10 h-10 whitespace-nowrap bg-surface-subtle px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-4 last:pr-4",
                      alignClass(column.align)
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase tracking-wide outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
                          active && "text-foreground"
                        )}
                      >
                        {column.header}
                        {active ? (
                          sort?.direction === "asc" ? (
                            <ArrowUpIcon className="size-3" />
                          ) : (
                            <ArrowDownIcon className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-border/80 last:border-0"
                >
                  {visible.map((column, colIndex) => (
                    <td
                      key={column.id}
                      className="px-3 py-3 align-middle first:pl-4 last:pr-4"
                    >
                      <Skeleton
                        className={cn(
                          "h-3.5",
                          column.align === "right" && "ml-auto",
                          colIndex === 0
                            ? "w-3/4"
                            : colIndex % 3 === 0
                              ? "w-1/2"
                              : "w-2/3"
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visible.length}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              pageRows.map(row => (
                <tr
                  key={keyOf(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? event => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    "border-b border-border/80 bg-card transition-colors last:border-0 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row)
                  )}
                >
                  {visible.map(column => (
                    <td
                      key={column.id}
                      className={cn(
                        "px-3 py-2.5 align-middle text-[0.8125rem] first:pl-4 last:pr-4",
                        alignClass(column.align),
                        column.align === "right" && "tabular-nums",
                        column.className
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && sorted.length > pageSize ? (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="tabular-nums">
            {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="px-2 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
