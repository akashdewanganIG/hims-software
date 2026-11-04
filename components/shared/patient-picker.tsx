"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { Search, UserPlus, X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { usePatientSearch, type PatientOption } from "@/features/opd/api";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

type ListPosition = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

/**
 * Typeahead over the patient master (name, UHID or mobile). Always resolves
 * to an existing patient id — modules never create shadow patient records.
 * Results render in a body portal so scrollable dialogs cannot clip them.
 */
export function PatientPicker({
  value,
  onChange,
  onRegisterNew,
  autoFocus,
  invalid,
}: {
  value: PatientOption | null;
  onChange: (patient: PatientOption | null) => void;
  onRegisterNew?: (query: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [listPosition, setListPosition] = React.useState<ListPosition>();
  const listId = React.useId();
  const { data = [], isFetching } = usePatientSearch(query);
  const results = query.trim().length >= 2 ? data.slice(0, 8) : [];
  const showResults = open && query.trim().length >= 2;

  React.useEffect(() => setActive(0), [query]);

  React.useLayoutEffect(() => {
    if (!showResults) {
      setListPosition(undefined);
      return;
    }
    const update = () => {
      const trigger = inputRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      const gap = 6;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const openAbove = below < 180 && above > below;
      const maxHeight = Math.max(120, Math.min(288, openAbove ? above : below));
      const width = Math.min(
        Math.max(rect.width, Math.min(360, window.innerWidth - margin * 2)),
        window.innerWidth - margin * 2
      );
      const left = Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - margin - width
      );
      setListPosition({
        left,
        width,
        maxHeight,
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showResults]);

  if (value) {
    return (
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-lg border border-input bg-surface px-3 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-medium text-foreground">
            {value.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{value.uhid}</span> · {value.age} y{" "}
            {value.gender === "MALE"
              ? "M"
              : value.gender === "FEMALE"
                ? "F"
                : "O"}{" "}
            · {formatPhone(value.phone)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Change patient"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  const choose = (patient: PatientOption) => {
    onChange(patient);
    setQuery("");
    setOpen(false);
  };

  const resultsList =
    showResults && listPosition
      ? createPortal(
          <div
            id={listId}
            role="listbox"
            aria-label="Patient search results"
            style={listPosition}
            className="pointer-events-auto fixed z-[90] overflow-y-auto overscroll-contain rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-xl shadow-black/10"
          >
            {results.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                {isFetching
                  ? "Searching…"
                  : `No patient matches “${query.trim()}”.`}
              </p>
            ) : (
              results.map((patient, index) => (
                <div
                  key={patient.id}
                  id={`${listId}-option-${patient.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={event => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(patient)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5",
                    index === active && "bg-secondary"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.8125rem] font-medium">
                      {patient.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {patient.age} y · {formatPhone(patient.phone)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                    {patient.uhid}
                  </span>
                </div>
              ))
            )}
            {onRegisterNew ? (
              <button
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  onRegisterNew(query);
                  setOpen(false);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border-subtle px-2.5 py-2 text-left text-[0.8125rem] font-medium text-primary outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <UserPlus className="size-4" />
                Register a new patient
              </button>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        value={query}
        aria-invalid={invalid || undefined}
        role="combobox"
        aria-expanded={showResults}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showResults && results[active]
            ? `${listId}-option-${results[active]!.id}`
            : undefined
        }
        placeholder="Search by name, UHID or mobile"
        className="pl-9"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!results.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(index => (index + 1) % results.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(index => (index - 1 + results.length) % results.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const hit = results[active];
            if (hit) choose(hit);
          }
        }}
      />
      {resultsList}
    </div>
  );
}
