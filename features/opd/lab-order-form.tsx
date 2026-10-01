"use client";

import * as React from "react";

import { Check } from "@/components/icons";
import { Field } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { useAction } from "@/lib/api/client";
import { formatINR } from "@/lib/format";
import type { ID, LabPriority } from "@/lib/sim/schema";
import { cn } from "@/lib/utils";

import { useLabTestOptions } from "./api";

/** Pick tests from the lab catalogue; charges post to the visit's bill. */
export function LabOrderForm({
  encounterId,
  onDone,
}: {
  encounterId: ID;
  onDone?: () => void;
}) {
  const { data: tests = [] } = useLabTestOptions();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [priority, setPriority] = React.useState<LabPriority>("ROUTINE");
  const [notes, setNotes] = React.useState("");

  const sections = React.useMemo(() => {
    const map = new Map<string, typeof tests>();
    for (const t of tests)
      map.set(t.section, [...(map.get(t.section) ?? []), t]);
    return [...map.entries()];
  }, [tests]);

  const total = tests
    .filter(t => selected.has(t.id))
    .reduce((sum, t) => sum + t.price, 0);

  const order = useAction(
    "lab.order",
    () => ({
      encounterId,
      testIds: [...selected],
      priority,
      clinicalNotes: notes,
    }),
    {
      success: o => `Lab order ${o.code} sent to the laboratory`,
      onSuccess: () => {
        setSelected(new Set());
        setNotes("");
        setPriority("ROUTINE");
        onDone?.();
      },
    }
  );

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map(([section, list]) => (
          <fieldset key={section} className="min-w-0">
            <legend className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {section}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {list.map(t => {
                const on = selected.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(t.id)}
                    title={`${t.name} · ${formatINR(t.price)} · ~${t.tat} h`}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
                      on
                        ? "border-primary bg-primary-surface text-primary-surface-foreground"
                        : "border-border bg-surface text-foreground hover:border-border-strong"
                    )}
                  >
                    {on ? <Check className="size-3" /> : null}
                    {t.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Priority">
          <SelectField
            value={priority}
            onChange={e => setPriority(e.target.value as LabPriority)}
          >
            <option value="ROUTINE">Routine</option>
            <option value="URGENT">Urgent</option>
            <option value="STAT">STAT</option>
          </SelectField>
        </Field>
        <Field label="Clinical notes for the lab">
          <Input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Fever 3 days, rule out dengue"
          />
        </Field>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {selected.size
            ? `${selected.size} test${selected.size === 1 ? "" : "s"} · ${formatINR(total)} billed to this visit`
            : "Select one or more tests."}
        </p>
        <Button
          type="button"
          disabled={!selected.size || order.isPending}
          onClick={() => order.mutate()}
        >
          {order.isPending ? "Ordering…" : "Order tests"}
        </Button>
      </div>
    </div>
  );
}
