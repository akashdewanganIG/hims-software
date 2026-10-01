"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type CategorySwitcherItem<T extends string> = {
  value: T;
  label: React.ReactNode;
  count?: number;
};

type CategorySwitcherProps<T extends string> = {
  items: ReadonlyArray<CategorySwitcherItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  className?: string;
};

export function CategorySwitcher<T extends string>({
  items,
  value,
  onValueChange,
  label,
  className,
}: CategorySwitcherProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectAt = (index: number) => {
    const item = items[index];
    if (!item) return;
    onValueChange(item.value);
    refs.current[index]?.focus();
  };

  const move = (from: number, direction: 1 | -1) => {
    selectAt((from + direction + items.length) % items.length);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex w-fit max-w-full shrink-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-surface-secondary p-0.5 align-middle",
        className
      )}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={node => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-state={selected ? "active" : "inactive"}
            onClick={() => onValueChange(item.value)}
            onKeyDown={event => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                move(index, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                selectAt(0);
              } else if (event.key === "End") {
                event.preventDefault();
                selectAt(items.length - 1);
              }
            }}
            className={cn(
              "inline-flex h-7 min-w-max shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring/30",

              selected
                ? "bg-primary-surface text-primary-surface-foreground"
                : "text-muted-foreground hover:bg-hover hover:text-foreground"
            )}
          >
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count !== undefined ? (
              <>
                {" "}
                <span
                  className={cn(
                    "tabular-nums",
                    selected ? "opacity-70" : "opacity-80"
                  )}
                >
                  {item.count}
                </span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
