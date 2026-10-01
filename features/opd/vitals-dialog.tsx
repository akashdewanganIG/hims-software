"use client";

import * as React from "react";

import { Field } from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/api/client";
import type { ID, Vitals } from "@/lib/sim/schema";

const FIELDS: Array<{
  key: keyof Omit<Vitals, "recordedAt" | "recordedById">;
  label: string;
  unit: string;
  step?: string;
  placeholder: string;
}> = [
  {
    key: "temperatureC",
    label: "Temperature",
    unit: "°C",
    step: "0.1",
    placeholder: "36.8",
  },
  { key: "pulse", label: "Pulse", unit: "/min", placeholder: "78" },
  { key: "systolic", label: "BP systolic", unit: "mmHg", placeholder: "120" },
  { key: "diastolic", label: "BP diastolic", unit: "mmHg", placeholder: "80" },
  {
    key: "respiratoryRate",
    label: "Respiratory rate",
    unit: "/min",
    placeholder: "16",
  },
  { key: "spo2", label: "SpO₂", unit: "%", placeholder: "98" },
  {
    key: "weightKg",
    label: "Weight",
    unit: "kg",
    step: "0.1",
    placeholder: "65",
  },
  { key: "heightCm", label: "Height", unit: "cm", placeholder: "165" },
];

export function VitalsDialog({
  open,
  onOpenChange,
  encounterId,
  patientName,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: ID;
  patientName: string;
  current?: Vitals;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setValues(
      Object.fromEntries(
        FIELDS.map(f => [
          f.key,
          current?.[f.key] !== undefined ? String(current[f.key]) : "",
        ])
      )
    );
  }, [open, current]);

  const save = useAction(
    "opd.recordVitals",
    (input: Record<string, number | undefined>) => ({
      encounterId,
      vitals: input,
    }),
    { success: "Vitals recorded", onSuccess: () => onOpenChange(false) }
  );

  const bmi = (() => {
    const w = Number(values.weightKg);
    const h = Number(values.heightCm) / 100;
    return w > 0 && h > 0 ? (w / (h * h)).toFixed(1) : null;
  })();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record vitals"
      description={patientName}
      size="md"
      isSubmitting={save.isPending}
      submitLabel="Save vitals"
      onSubmit={event => {
        event.preventDefault();
        const input: Record<string, number | undefined> = {};
        for (const f of FIELDS) {
          const raw = values[f.key]?.trim();
          input[f.key] = raw ? Number(raw) : undefined;
        }
        save.mutate(input);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(f => (
          <Field key={f.key} label={`${f.label} (${f.unit})`}>
            <Input
              type="number"
              inputMode="decimal"
              step={f.step ?? "1"}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={e =>
                setValues(current => ({ ...current, [f.key]: e.target.value }))
              }
            />
          </Field>
        ))}
      </div>
      {bmi ? (
        <p className="text-xs text-muted-foreground">BMI {bmi} kg/m²</p>
      ) : null}
    </FormDialog>
  );
}
