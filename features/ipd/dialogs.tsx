"use client";

import * as React from "react";

import { Field } from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/lib/api/client";
import { formatINR, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  CARE_ORDER_TYPES,
  type CareOrderType,
  type ClinicalNoteType,
  type ID,
} from "@/lib/sim/schema";

import { bedFits, useFreeBeds } from "./api";

export function NoteDialog({
  open,
  onOpenChange,
  admissionId,
  hasAdmissionNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: ID;
  hasAdmissionNote: boolean;
}) {
  const { staff } = useSession();
  const job = staff?.role;
  const defaultType: ClinicalNoteType =
    job === "NURSE" ? "NURSING" : hasAdmissionNote ? "PROGRESS" : "ADMISSION";
  const [type, setType] = React.useState<ClinicalNoteType>(defaultType);
  const [text, setText] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setText("");
  }, [open, defaultType]);

  const save = useAction("ipd.addNote", () => ({ admissionId, type, text }), {
    success: "Note added to the inpatient record",
    onSuccess: () => onOpenChange(false),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add clinical note"
      description={
        job === "DOCTOR"
          ? "A doctor's first progress note of the day is billed as a consultant visit."
          : undefined
      }
      size="md"
      submitLabel="Add note"
      isSubmitting={save.isPending}
      submitDisabled={!text.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Note type">
        <SelectField
          value={type}
          onChange={e => setType(e.target.value as ClinicalNoteType)}
        >
          {!hasAdmissionNote ? (
            <option value="ADMISSION">Admission note</option>
          ) : null}
          <option value="PROGRESS">Progress note</option>
          <option value="NURSING">Nursing note</option>
          <option value="PROCEDURE">Procedure note</option>
        </SelectField>
      </Field>
      <Field label="Note" required>
        <Textarea
          autoFocus
          className="min-h-32"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Findings, response to treatment and plan"
        />
      </Field>
    </FormDialog>
  );
}

export function CareOrderDialog({
  open,
  onOpenChange,
  admissionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: ID;
}) {
  const [type, setType] = React.useState<CareOrderType>("MONITORING");
  const [instruction, setInstruction] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setType("MONITORING");
    setInstruction("");
  }, [open]);
  const save = useAction(
    "ipd.addCareOrder",
    () => ({ admissionId, type, instruction }),
    {
      success: "Order added",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New care order"
      description="Diet, nursing, monitoring and activity instructions. Medicines and tests have their own orders."
      size="md"
      submitLabel="Add order"
      isSubmitting={save.isPending}
      submitDisabled={!instruction.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Order type">
        <SelectField
          value={type}
          onChange={e => setType(e.target.value as CareOrderType)}
        >
          {CARE_ORDER_TYPES.map(t => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </SelectField>
      </Field>
      <Field label="Instruction" required>
        <Input
          autoFocus
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="e.g. Vitals 2-hourly, strict intake-output"
        />
      </Field>
    </FormDialog>
  );
}

export function TransferDialog({
  open,
  onOpenChange,
  admissionId,
  currentBed,
  patient,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: ID;
  currentBed?: string;
  /** Filters the choice to wards that can take this patient. */
  patient?: { gender: string; age: number };
}) {
  const { data: beds = [] } = useFreeBeds();
  const [bedId, setBedId] = React.useState("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setBedId("");
    setReason("");
  }, [open]);
  const wards = React.useMemo(() => {
    const map = new Map<string, typeof beds>();
    for (const bed of beds.filter(
      b => b.status === "AVAILABLE" && bedFits(b, patient)
    ))
      map.set(bed.ward, [...(map.get(bed.ward) ?? []), bed]);
    return [...map.entries()];
  }, [beds, patient]);

  const save = useAction(
    "ipd.requestTransfer",
    () => ({ admissionId, toBedId: bedId, reason }),
    {
      success: "Transfer requested — target bed held as reserved",
      onSuccess: () => onOpenChange(false),
    }
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Request bed transfer"
      description={`Currently in ${currentBed ?? "—"}. The target bed is held until the move is completed or cancelled.`}
      size="md"
      submitLabel="Request transfer"
      isSubmitting={save.isPending}
      submitDisabled={!bedId || !reason.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Move to bed" required>
        <SelectField value={bedId} onChange={e => setBedId(e.target.value)}>
          <option value="">Choose an available bed…</option>
          {wards.map(([ward, list]) => (
            <optgroup key={ward} label={ward}>
              {list.map(b => (
                <option key={b.id} value={b.id}>
                  {`${ward} · ${b.code} · ${formatINR(b.dailyRate)}/day`}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
      </Field>
      <Field label="Reason" required>
        <Input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Stable — step-down from HDU"
        />
      </Field>
    </FormDialog>
  );
}
