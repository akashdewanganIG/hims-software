"use client";

import * as React from "react";
import { Search } from "@/components/icons";
import { Input } from "./input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export type SearchableSelectItem = {
  value: string;
  label: React.ReactNode;

  searchText?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  items: SearchableSelectItem[];
  searchPlaceholder?: string;
  triggerClassName?: string;
};

export function SearchableSelect({
  value,
  onValueChange,
  placeholder = "Select...",
  items,
  searchPlaceholder = "Search...",
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it => {
      const hay = (it.searchText ?? String(it.value)).toLowerCase();
      const labelStr =
        typeof it.label === "string" ? it.label.toLowerCase() : "";
      return hay.includes(q) || labelStr.includes(q);
    });
  }, [items, query]);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      open={open}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-w-[90vw]">
        <div
          className="sticky top-0 z-10 border-b bg-popover p-2"
          onClick={e => e.stopPropagation()}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 inset-y-0 my-auto h-fit size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
              onKeyDown={e => {
                e.stopPropagation();

                if (
                  e.key !== "Escape" &&
                  e.key !== "Enter" &&
                  e.key !== "Tab"
                ) {
                  const nativeEvent = e.nativeEvent as Event & {
                    stopImmediatePropagation?: () => void;
                  };
                  nativeEvent.stopImmediatePropagation?.();
                }
              }}
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onFocus={e => {
                e.stopPropagation();
                e.currentTarget.focus();
              }}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No results found.
          </div>
        ) : (
          filtered.map(it => (
            <SelectItem key={it.value} value={it.value} disabled={it.disabled}>
              {it.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
