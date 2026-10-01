"use client";

import * as React from "react";

import { Plus, Trash2 } from "@/components/icons";
import { Field } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import type { ConsultationInput } from "@/lib/domain/opd";
import { CONDITIONS } from "@/lib/sim/reference";
import type { Diagnosis, Encounter } from "@/lib/sim/schema";
import { isoDate } from "@/lib/sim/time";

export function toConsultationInput(e: Encounter): ConsultationInput {
  return {
    chiefComplaint: e.chiefComplaint,
    history: e.history,
    examination: e.examination,
    diagnoses: e.diagnoses.length ? e.diagnoses : [],
    consultationNotes: e.consultationNotes,
    advice: e.advice,
    followUpDate: e.followUpDate,
    referral: e.referral,
  };
}

const ICD_OPTIONS = [
  ...new Map(CONDITIONS.map(c => [c.diagnosis, c.icd])).entries(),
];

/**
 * Structured OPD documentation. Controlled by the parent so the note can be
 * saved on its own or together with visit closure in one transaction.
 */
export function ConsultationForm({
  value,
  onChange,
  readOnly,
  departments,
}: {
  value: ConsultationInput;
  onChange: (next: ConsultationInput) => void;
  readOnly: boolean;
  departments: Array<{ id: string; name: string; kind: string }>;
}) {
  const listId = React.useId();
  const set = <K extends keyof ConsultationInput>(
    key: K,
    next: ConsultationInput[K]
  ) => onChange({ ...value, [key]: next });
  const setDiagnosis = (index: number, patch: Partial<Diagnosis>) =>
    set(
      "diagnoses",
      value.diagnoses.map((d, i) => {
        if (i !== index) return d;
        const next = { ...d, ...patch };
        if (patch.description) {
          const icd = ICD_OPTIONS.find(
            ([name]) => name === patch.description
          )?.[1];
          if (icd && !d.code) next.code = icd;
        }
        return next;
      })
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Chief complaint" className="lg:col-span-2">
          <Input
            readOnly={readOnly}
            value={value.chiefComplaint}
            onChange={e => set("chiefComplaint", e.target.value)}
          />
        </Field>
        <Field label="History of present illness">
          <Textarea
            readOnly={readOnly}
            className="min-h-20"
            value={value.history}
            onChange={e => set("history", e.target.value)}
            placeholder="Onset, duration, associated symptoms, relevant past history"
          />
        </Field>
        <Field label="Examination">
          <Textarea
            readOnly={readOnly}
            className="min-h-20"
            value={value.examination}
            onChange={e => set("examination", e.target.value)}
            placeholder="General and systemic examination findings"
          />
        </Field>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[0.8125rem] font-medium text-foreground">
            Diagnosis<span className="ml-0.5 text-error-foreground">*</span>
          </span>
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                set("diagnoses", [
                  ...value.diagnoses,
                  {
                    description: "",
                    type: value.diagnoses.length ? "SECONDARY" : "PRIMARY",
                  },
                ])
              }
            >
              <Plus className="size-4" />
              Add diagnosis
            </Button>
          ) : null}
        </div>
        <datalist id={listId}>
          {ICD_OPTIONS.map(([name, icd]) => (
            <option key={name} value={name}>
              {icd}
            </option>
          ))}
        </datalist>
        {value.diagnoses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
            {readOnly
              ? "No diagnosis recorded."
              : "Add at least one diagnosis before closing the visit."}
          </p>
        ) : (
          <div className="space-y-2">
            {value.diagnoses.map((d, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_9rem_auto]"
              >
                <Input
                  readOnly={readOnly}
                  aria-label="ICD-10 code"
                  placeholder="ICD-10"
                  value={d.code ?? ""}
                  onChange={e =>
                    setDiagnosis(index, { code: e.target.value.toUpperCase() })
                  }
                  className="font-mono"
                />
                <Input
                  readOnly={readOnly}
                  aria-label="Diagnosis"
                  list={listId}
                  placeholder="Start typing a diagnosis"
                  value={d.description}
                  onChange={e =>
                    setDiagnosis(index, { description: e.target.value })
                  }
                />
                <SelectField
                  disabled={readOnly}
                  aria-label="Diagnosis type"
                  value={d.type}
                  onChange={e =>
                    setDiagnosis(index, {
                      type: e.target.value as Diagnosis["type"],
                    })
                  }
                >
                  <option value="PRIMARY">Primary</option>
                  <option value="SECONDARY">Secondary</option>
                  <option value="PROVISIONAL">Provisional</option>
                </SelectField>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove diagnosis"
                    onClick={() =>
                      set(
                        "diagnoses",
                        value.diagnoses.filter((_, i) => i !== index)
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Consultation notes">
          <Textarea
            readOnly={readOnly}
            className="min-h-20"
            value={value.consultationNotes}
            onChange={e => set("consultationNotes", e.target.value)}
            placeholder="Assessment and plan"
          />
        </Field>
        <Field label="Advice to patient">
          <Textarea
            readOnly={readOnly}
            className="min-h-20"
            value={value.advice}
            onChange={e => set("advice", e.target.value)}
            placeholder="Diet, activity, warning signs"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-[11rem_12rem_minmax(0,1fr)]">
        <Field label="Follow-up date">
          <Input
            type="date"
            readOnly={readOnly}
            min={isoDate(new Date())}
            value={value.followUpDate ?? ""}
            onChange={e => set("followUpDate", e.target.value || undefined)}
          />
        </Field>
        <Field label="Refer to">
          <SelectField
            disabled={readOnly}
            value={value.referral?.toDepartmentId ?? ""}
            onChange={e =>
              set("referral", {
                note: value.referral?.note ?? "",
                toDepartmentId: e.target.value || undefined,
              })
            }
          >
            <option value="">No referral</option>
            {departments
              .filter(d => d.kind === "CLINICAL")
              .map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </SelectField>
        </Field>
        <Field label="Referral note">
          <Input
            readOnly={readOnly}
            value={value.referral?.note ?? ""}
            onChange={e =>
              set("referral", {
                toDepartmentId: value.referral?.toDepartmentId,
                note: e.target.value,
              })
            }
            placeholder="Reason for referral"
          />
        </Field>
      </div>
    </div>
  );
}
