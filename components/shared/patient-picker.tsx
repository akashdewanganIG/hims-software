"use client";

import * as React from "react";

import { Search, UserPlus, X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { usePatientSearch, type PatientOption } from "@/features/opd/api";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Typeahead over the patient master (name, UHID or mobile). Always resolves
 * to an existing patient id — modules never create shadow patient records.
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
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const { data = [], isFetching } = usePatientSearch(query);
  const results = query.trim().length >= 2 ? data.slice(0, 8) : [];

  React.useEffect(() => setActive(0), [query]);

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

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        value={query}
        aria-invalid={invalid || undefined}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Search by name, UHID or mobile"
        className="pl-9"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={event => {
          if (!results.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(i => (i + 1) % results.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(i => (i - 1 + results.length) % results.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const hit = results[active];
            if (hit) choose(hit);
          }
        }}
      />
      {open && query.trim().length >= 2 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-xl shadow-black/10"
        >
          {results.length === 0 && !isFetching ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">
              No patient matches “{query.trim()}”.
            </p>
          ) : (
            results.map((patient, index) => (
              <div
                key={patient.id}
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
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border-subtle px-2.5 py-2 text-left text-[0.8125rem] font-medium text-primary outline-none hover:bg-secondary"
            >
              <UserPlus className="size-4" />
              Register a new patient
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
