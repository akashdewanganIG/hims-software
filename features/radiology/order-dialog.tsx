"use client";

import * as React from "react";
import { PatientPicker } from "@/components/shared/patient-picker";
import { Field, SelectField } from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PatientOption } from "@/features/opd/api";
import { useRadiologyCatalog } from "@/features/radiology/api";
import { useAction } from "@/lib/api/client";
import { humanize } from "@/lib/format";
import { RADIOLOGY_PRIORITIES, type RadiologyPriority } from "@/lib/sim/schema";

export function RadiologyOrderDialog({
  open,
  onOpenChange,
  initialPatient,
  encounterId,
  admissionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPatient?: PatientOption;
  encounterId?: string;
  admissionId?: string;
}) {
  const { data: catalog } = useRadiologyCatalog();
  const [patient, setPatient] = React.useState<PatientOption | null>(
    initialPatient ?? null
  );
  const [procedureIds, setProcedureIds] = React.useState<string[]>([]);
  const [priority, setPriority] = React.useState<RadiologyPriority>("ROUTINE");
  const [indication, setIndication] = React.useState("");
  const [diagnosis, setDiagnosis] = React.useState("");
  const [referrer, setReferrer] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setPatient(initialPatient ?? null);
      setProcedureIds([]);
      setPriority("ROUTINE");
      setIndication("");
      setDiagnosis("");
      setReferrer("");
    }
  }, [initialPatient, open]);
  const save = useAction(
    "radiology.order",
    () => ({
      patientId: patient!.id,
      procedureIds,
      priority,
      clinicalIndication: indication,
      provisionalDiagnosis: diagnosis,
      encounterId,
      admissionId,
      externalReferrer:
        encounterId || admissionId ? undefined : referrer || "Radiology desk",
    }),
    {
      success:
        procedureIds.length > 1
          ? "Linked imaging orders created"
          : "Imaging order created",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New imaging order"
      size="lg"
      submitLabel={
        procedureIds.length > 1
          ? `Create ${procedureIds.length} linked orders`
          : "Create order"
      }
      isSubmitting={save.isPending}
      submitDisabled={!patient || !procedureIds.length || !indication.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Patient" required>
          {initialPatient ? (
            <Input
              value={`${initialPatient.name} · ${initialPatient.uhid}`}
              readOnly
            />
          ) : (
            <PatientPicker value={patient} onChange={setPatient} />
          )}
        </Field>
        <Field label="Priority">
          <SelectField
            value={priority}
            onChange={event =>
              setPriority(event.target.value as RadiologyPriority)
            }
          >
            {RADIOLOGY_PRIORITIES.map(value => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </SelectField>
        </Field>
        {!encounterId && !admissionId ? (
          <Field label="External referrer">
            <Input
              value={referrer}
              onChange={event => setReferrer(event.target.value)}
              placeholder="Doctor / facility"
            />
          </Field>
        ) : null}
      </div>
      <Field
        label="Procedures"
        required
        hint="Each selected procedure receives its own accession number and bill line."
      >
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          {catalog?.procedures.map(row => (
            <label
              key={row.id}
              className="flex items-start gap-2 rounded-lg p-2 hover:bg-secondary"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={procedureIds.includes(row.id)}
                onChange={event =>
                  setProcedureIds(current =>
                    event.target.checked
                      ? [...current, row.id]
                      : current.filter(id => id !== row.id)
                  )
                }
              />
              <span>
                <span className="block text-sm font-medium">{row.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {humanize(row.modality)} · {row.durationMinutes} min
                </span>
              </span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Clinical indication" required>
        <Textarea
          value={indication}
          onChange={event => setIndication(event.target.value)}
        />
      </Field>
      <Field label="Provisional diagnosis">
        <Textarea
          value={diagnosis}
          onChange={event => setDiagnosis(event.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
