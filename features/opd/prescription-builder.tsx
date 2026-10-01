"use client";

import * as React from "react";

import { AlertTriangle, Plus, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectField } from "@/components/ui/select-field";
import { useAction } from "@/lib/api/client";
import { DOSES_PER_DAY } from "@/lib/domain/pharmacy";
import { formatINR, humanize } from "@/lib/format";
import {
  FREQUENCIES,
  ROUTES,
  type Frequency,
  type ID,
  type Route,
} from "@/lib/sim/schema";

import { useMedicineOptions } from "./api";

interface Line {
  key: number;
  medicineId: string;
  dose: string;
  frequency: Frequency;
  route: Route;
  durationDays: string;
  quantity: string;
  quantityTouched: boolean;
  instructions: string;
}

const COUNTED = new Set(["TABLET", "CAPSULE", "INJECTION", "INFUSION"]);
const FREQUENCY_HINT: Record<Frequency, string> = {
  OD: "Once daily",
  BD: "Twice daily",
  TDS: "Three times daily",
  QID: "Four times daily",
  HS: "At bedtime",
  SOS: "When required",
  STAT: "Immediately, once",
};

const DEFAULT_ROUTE: Record<string, Route> = {
  INJECTION: "IV",
  INFUSION: "IV",
  OINTMENT: "TOPICAL",
  INHALER: "INHALED",
  DROPS: "TOPICAL",
};

let nextKey = 1;
const blank = (): Line => ({
  key: nextKey++,
  medicineId: "",
  dose: "1 tablet",
  frequency: "BD",
  route: "ORAL",
  durationDays: "5",
  quantity: "",
  quantityTouched: false,
  instructions: "",
});

/**
 * Structured prescribing: each line resolves to a formulary medicine so the
 * pharmacy queue, stock and bill all see the same item.
 */
export function PrescriptionBuilder({
  encounterId,
  allergies,
  dischargeMedication = false,
  onDone,
  submitLabel = "Send to pharmacy",
}: {
  encounterId: ID;
  allergies: string[];
  dischargeMedication?: boolean;
  onDone?: () => void;
  submitLabel?: string;
}) {
  const { data: medicines = [] } = useMedicineOptions();
  const [lines, setLines] = React.useState<Line[]>(() => [blank()]);
  const [notes, setNotes] = React.useState("");

  const byId = React.useMemo(
    () => new Map(medicines.map(m => [m.id, m])),
    [medicines]
  );

  const autoQuantity = (line: Line) => {
    const m = byId.get(line.medicineId);
    if (!m) return "";
    if (!COUNTED.has(m.form)) return "1";
    if (line.frequency === "STAT") return "1";
    return String(
      Math.max(
        1,
        DOSES_PER_DAY[line.frequency] *
          Math.max(1, Number(line.durationDays) || 1)
      )
    );
  };

  const update = (key: number, patch: Partial<Line>) =>
    setLines(current =>
      current.map(line => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.medicineId) {
          const m = byId.get(patch.medicineId);
          if (m) {
            next.route = DEFAULT_ROUTE[m.form] ?? "ORAL";
            next.dose =
              m.form === "TABLET"
                ? "1 tablet"
                : m.form === "CAPSULE"
                  ? "1 capsule"
                  : m.form === "SYRUP"
                    ? "5 ml"
                    : m.form === "OINTMENT"
                      ? "Apply thin layer"
                      : m.form === "DROPS"
                        ? "2 drops"
                        : m.form === "INHALER"
                          ? "2 puffs"
                          : m.strength;
          }
        }
        if (!next.quantityTouched) next.quantity = autoQuantity(next);
        return next;
      })
    );

  const allergyHit = (medicineId: string) => {
    const m = byId.get(medicineId);
    if (!m) return undefined;
    return allergies.find(a =>
      [m.name, m.genericName, m.category].some(v =>
        v.toLowerCase().includes(a.toLowerCase())
      )
    );
  };

  const valid = lines.filter(l => l.medicineId);
  const estimate = valid.reduce(
    (sum, l) =>
      sum +
      (byId.get(l.medicineId)?.unitPrice ?? 0) * (Number(l.quantity) || 0),
    0
  );

  const submit = useAction(
    "rx.create",
    () => ({
      encounterId,
      notes,
      isDischargeMedication: dischargeMedication,
      items: valid.map(l => ({
        medicineId: l.medicineId,
        dose: l.dose,
        frequency: l.frequency,
        route: l.route,
        durationDays: Math.max(1, Math.round(Number(l.durationDays) || 1)),
        quantity: Math.round(Number(l.quantity)) || undefined,
        instructions: l.instructions,
      })),
    }),
    {
      success: rx => `Prescription ${rx.code} sent to pharmacy`,
      onSuccess: () => {
        setLines([blank()]);
        setNotes("");
        onDone?.();
      },
    }
  );

  const items = medicines.map(m => ({
    value: m.id,
    label: `${m.name} ${m.strength}`,
    searchText: `${m.name} ${m.genericName} ${m.category} ${m.strength}`,
  }));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div
          aria-hidden="true"
          className="hidden gap-2 px-2.5 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_7rem_6.5rem_5rem_5rem_auto]"
        >
          <span>Medicine</span>
          <span>Dose</span>
          <span>Frequency</span>
          <span>Route</span>
          <span>Days</span>
          <span>Qty</span>
          <span className="w-9" />
        </div>
        {lines.map(line => {
          const m = byId.get(line.medicineId);
          const allergy = allergyHit(line.medicineId);
          const short = m && Number(line.quantity) > m.stock;
          return (
            <div
              key={line.key}
              className="rounded-lg border border-border bg-surface-subtle/50 p-2.5"
            >
              <div className="grid gap-2 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_7rem_6.5rem_5rem_5rem_auto]">
                <div className="min-w-0">
                  <SearchableSelect
                    triggerClassName="w-full"
                    items={items}
                    value={line.medicineId || undefined}
                    onValueChange={value =>
                      update(line.key, { medicineId: value })
                    }
                    placeholder="Search formulary…"
                    searchPlaceholder="Name, generic or class"
                  />
                </div>
                <div className="min-w-0">
                  <Input
                    value={line.dose}
                    onChange={e => update(line.key, { dose: e.target.value })}
                    aria-label="Dose"
                  />
                </div>
                <div className="min-w-0">
                  <SelectField
                    value={line.frequency}
                    onChange={e =>
                      update(line.key, {
                        frequency: e.target.value as Frequency,
                      })
                    }
                    aria-label="Frequency"
                  >
                    {FREQUENCIES.map(f => (
                      <option key={f} value={f}>
                        {`${f} · ${FREQUENCY_HINT[f]}`}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="min-w-0">
                  <SelectField
                    value={line.route}
                    onChange={e =>
                      update(line.key, { route: e.target.value as Route })
                    }
                    aria-label="Route"
                  >
                    {ROUTES.map(r => (
                      <option key={r} value={r}>
                        {humanize(r)}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="min-w-0">
                  <Input
                    type="number"
                    min={1}
                    value={line.durationDays}
                    onChange={e =>
                      update(line.key, { durationDays: e.target.value })
                    }
                    aria-label="Duration in days"
                  />
                </div>
                <div className="min-w-0">
                  <Input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={e =>
                      update(line.key, {
                        quantity: e.target.value,
                        quantityTouched: true,
                      })
                    }
                    aria-label="Quantity to dispense"
                  />
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove medicine"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines(current =>
                        current.filter(l => l.key !== line.key)
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="sm:max-w-md"
                  size="sm"
                  value={line.instructions}
                  onChange={e =>
                    update(line.key, { instructions: e.target.value })
                  }
                  placeholder="Instructions, e.g. after food"
                  aria-label="Instructions"
                />
                {m ? (
                  <p className="text-xs text-muted-foreground">
                    {humanize(m.form)} · {m.category} · {formatINR(m.unitPrice)}
                    /{m.unit} ·{" "}
                    <span
                      className={
                        short ? "font-medium text-error-foreground" : ""
                      }
                    >
                      {m.stock} in stock
                    </span>
                  </p>
                ) : null}
              </div>
              {allergy ? (
                <p
                  role="alert"
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-error-foreground"
                >
                  <AlertTriangle className="size-3.5" />
                  Patient is allergic to {allergy}. This line will be refused.
                </p>
              ) : short ? (
                <p className="mt-2 text-xs text-warning-foreground">
                  Pharmacy stock is short; the balance can be dispensed later.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines(current => [...current, blank()])}
        >
          <Plus className="size-4" />
          Add medicine
        </Button>
        <Input
          className="sm:max-w-sm"
          size="sm"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Note to pharmacist (optional)"
          aria-label="Note to pharmacist"
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {valid.length
            ? `${valid.length} item${valid.length === 1 ? "" : "s"} · approx. ${formatINR(estimate)} billed on dispensing`
            : "Add at least one medicine."}
        </p>
        <Button
          type="button"
          disabled={!valid.length || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? "Sending…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
