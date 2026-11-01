"use client";

import * as React from "react";

import { CalendarDays } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DatePreset {
  label: string;
  value: DateRangeValue;
}

export function formatDateRange(value: DateRangeValue) {
  return value.from === value.to
    ? formatDate(value.from)
    : `${formatDateShort(value.from)} – ${formatDate(value.to)}`;
}

export function DateFilter({
  value,
  onChange,
  label = "Date range",
  presets = [],
  min,
  max,
  single = false,
  className,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  label?: string;
  presets?: DatePreset[];
  min?: string;
  max?: string;
  single?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  const show = () => {
    setDraft(value);
    setOpen(true);
  };
  const invalid =
    !draft.from ||
    (!single && !draft.to) ||
    (!single && draft.from > draft.to) ||
    Boolean(min && draft.from < min) ||
    Boolean(max && (draft.from > max || (!single && draft.to > max)));
  const selected = (preset: DatePreset) =>
    preset.value.from === draft.from && preset.value.to === draft.to;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={show}
        className={cn("justify-start", className)}
        aria-label={`${label}: ${formatDateRange(value)}`}
      >
        <CalendarDays className="size-4" />
        <span className="truncate">{formatDateRange(value)}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {single ? "Choose date" : "Choose date range"}
            </DialogTitle>
            <DialogDescription>
              {single
                ? `Select the date used for ${label.toLowerCase()}.`
                : "Choose a quick period or set an exact start and end date."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {presets.length ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Quick select
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {presets.map(preset => (
                    <Button
                      key={`${preset.label}-${preset.value.from}-${preset.value.to}`}
                      type="button"
                      size="sm"
                      variant={selected(preset) ? "secondary" : "outline"}
                      onClick={() => setDraft(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={cn("grid gap-3", !single && "sm:grid-cols-2")}>
              <label className="block min-w-0 text-[0.8125rem] font-medium text-foreground">
                {single ? "Date" : "From"}
                <Input
                  className="mt-1.5"
                  type="date"
                  value={draft.from}
                  min={min}
                  max={single ? max : draft.to || max}
                  onChange={event =>
                    setDraft(current => ({
                      from: event.target.value,
                      to: single ? event.target.value : current.to,
                    }))
                  }
                />
              </label>
              {!single ? (
                <label className="block min-w-0 text-[0.8125rem] font-medium text-foreground">
                  To
                  <Input
                    className="mt-1.5"
                    type="date"
                    value={draft.to}
                    min={draft.from || min}
                    max={max}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        to: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
            </div>
            {!single && draft.from && draft.to && draft.from > draft.to ? (
              <p role="alert" className="text-xs text-error-foreground">
                The end date must be on or after the start date.
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={invalid}
              onClick={() => {
                onChange(single ? { from: draft.from, to: draft.from } : draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
