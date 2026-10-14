"use client";

import * as React from "react";

import { Field } from "@/components/shared/page";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { useAlertComposer } from "@/features/alerts/api";
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
import type { AdmissionDetail } from "./views";

function dateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

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

export function AdmissionAlertDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: AdmissionDetail;
}) {
  const { data: composer } = useAlertComposer();
  const { staff: signedInStaff } = useSession();
  const [roleId, setRoleId] = React.useState("DOCTOR");
  const [recipientId, setRecipientId] = React.useState(
    detail.admission.doctorId
  );
  const [category, setCategory] = React.useState("Clinical");
  const [customCategory, setCustomCategory] = React.useState("");
  const [priority, setPriority] = React.useState<
    "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  >("MEDIUM");
  const [subject, setSubject] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [acknowledgementRequired, setAcknowledgementRequired] =
    React.useState(false);
  const [dueAt, setDueAt] = React.useState("");
  const [escalationRoleId, setEscalationRoleId] = React.useState("");
  const [escalationRecipientId, setEscalationRecipientId] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setRoleId("DOCTOR");
    setRecipientId(detail.admission.doctorId);
    setCategory("Clinical");
    setCustomCategory("");
    setPriority("MEDIUM");
    setSubject("");
    setDetails("");
    setAcknowledgementRequired(false);
    setDueAt("");
    setEscalationRoleId("");
    setEscalationRecipientId("");
  }, [open, detail.admission.doctorId]);

  const roleStaff =
    composer?.staff.filter(
      staff => staff.roleId === roleId && staff.ipdAccess
    ) ?? [];
  const ipdRoleIds = new Set(
    composer?.staff.filter(staff => staff.ipdAccess).map(staff => staff.roleId)
  );
  const recipientIsAvailable = roleStaff.some(
    staff => staff.id === recipientId
  );
  const escalationStaff =
    composer?.staff.filter(
      staff =>
        staff.roleId === escalationRoleId &&
        staff.ipdAccess &&
        staff.id !== recipientId &&
        staff.id !== signedInStaff?.id
    ) ?? [];
  const escalationRecipientIsAvailable = escalationStaff.some(
    staff => staff.id === escalationRecipientId
  );
  const finalCategory =
    category === "__custom" ? customCategory.trim() : category;
  const patientName = `${detail.patient.firstName} ${detail.patient.lastName}`;
  const location = detail.row.bed
    ? `${detail.row.bed.ward} · Room ${detail.row.bed.room} · Bed ${detail.row.bed.code}`
    : "No bed currently assigned";
  const clinicalContext = [
    `Patient: ${patientName} (${detail.patient.uhid})`,
    `Admission: ${detail.admission.code}`,
    `Location: ${location}`,
    `Consultant: ${detail.row.doctor} · ${detail.row.department}`,
  ].join("\n");
  const dueTime = dueAt ? new Date(dueAt) : undefined;
  const dueIsValid =
    !dueTime ||
    (!Number.isNaN(dueTime.getTime()) && dueTime.getTime() > Date.now());
  const escalationIsValid =
    !escalationRecipientId ||
    (escalationRecipientIsAvailable &&
      Boolean(dueTime) &&
      (priority === "HIGH" || priority === "CRITICAL"));
  const formValid =
    recipientIsAvailable &&
    finalCategory.length >= 2 &&
    subject.trim().length >= 3 &&
    details.trim().length >= 5 &&
    dueIsValid &&
    escalationIsValid;

  const send = useAction(
    "alerts.send",
    () => ({
      audience: "STAFF" as const,
      audienceId: recipientId,
      category: finalCategory,
      subject,
      message: `${clinicalContext}\n\n${details.trim()}`,
      priority,
      acknowledgementRequired,
      patientId: detail.patient.id,
      admissionId: detail.admission.id,
      dueAt: dueTime?.toISOString(),
      escalationRecipientId: escalationRecipientId || undefined,
    }),
    {
      success: result =>
        `Alert sent to ${result.recipientIds.length} recipient${result.recipientIds.length === 1 ? "" : "s"}`,
      onSuccess: () => onOpenChange(false),
    }
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send an IPD alert"
      description="Send a patient-linked alert to one staff member. It will appear in your Sent mailbox and the recipient's Inbox."
      size="lg"
      submitLabel="Send alert"
      isSubmitting={send.isPending}
      submitDisabled={!formValid}
      onSubmit={event => {
        event.preventDefault();
        if (formValid) send.mutate();
      }}
      bodyClassName="sm:grid-cols-2"
    >
      <div className="rounded-xl border border-info-border bg-info-surface p-3 sm:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-info-foreground">
          Patient context included automatically
        </p>
        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-foreground">
          {clinicalContext}
        </p>
      </div>
      {detail.alertShortcuts.length ? (
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[0.8125rem] font-medium text-foreground">
            Care-team shortcuts
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.alertShortcuts.map(shortcut => (
              <Button
                key={`${shortcut.kind}-${shortcut.id}`}
                type="button"
                size="sm"
                variant={recipientId === shortcut.id ? "secondary" : "outline"}
                onClick={() => {
                  setRoleId(shortcut.roleId);
                  setRecipientId(shortcut.id);
                }}
              >
                <span>{shortcut.label}</span>
                <span className="text-muted-foreground">· {shortcut.name}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <Field label="Staff role" required>
        <SelectField
          value={roleId}
          onChange={event => {
            setRoleId(event.target.value);
            setRecipientId("");
          }}
        >
          <option value="">Choose a role</option>
          {composer?.roles
            .filter(role => ipdRoleIds.has(role.id))
            .map(role => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
        </SelectField>
      </Field>
      <Field
        label="Recipient"
        required
        hint={
          roleId && roleStaff.length === 0
            ? "No active staff with IPD access have this role."
            : "Only staff who can open this IPD record are listed."
        }
      >
        <SelectField
          value={recipientIsAvailable ? recipientId : ""}
          disabled={!roleId || roleStaff.length === 0}
          onChange={event => setRecipientId(event.target.value)}
        >
          <option value="">
            {roleId ? "Choose a person" : "Choose a role first"}
          </option>
          {roleStaff.map(staff => (
            <option key={staff.id} value={staff.id}>
              {staff.label}
            </option>
          ))}
        </SelectField>
      </Field>
      <Field label="Category" required>
        <SelectField
          value={category}
          onChange={event => setCategory(event.target.value)}
        >
          {(composer?.categories ?? ["Clinical"]).map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
          <option value="__custom">Add a custom category…</option>
        </SelectField>
      </Field>
      <Field label="Priority" required>
        <SelectField
          value={priority}
          onChange={event => setPriority(event.target.value as typeof priority)}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </SelectField>
      </Field>
      {category === "__custom" ? (
        <Field label="Custom category" required className="sm:col-span-2">
          <Input
            maxLength={40}
            value={customCategory}
            onChange={event => setCustomCategory(event.target.value)}
            placeholder="e.g. Infection control"
          />
        </Field>
      ) : null}
      <Field
        label="What is this about?"
        required
        className="sm:col-span-2"
        hint="Use a short subject the recipient can understand at a glance."
      >
        <Input
          maxLength={120}
          value={subject}
          onChange={event => setSubject(event.target.value)}
          placeholder="e.g. Review required for falling oxygen saturation"
        />
      </Field>
      <Field
        label="Complete details"
        required
        className="sm:col-span-2"
        hint="State what changed, what has already been done, and what response is needed."
      >
        <Textarea
          className="min-h-32"
          maxLength={1500}
          value={details}
          onChange={event => setDetails(event.target.value)}
          placeholder="Describe the situation, relevant observations, action taken and requested next step."
        />
      </Field>
      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle p-3 sm:col-span-2">
        <Checkbox
          className="mt-0.5"
          aria-label="Require acknowledgement"
          checked={acknowledgementRequired}
          onCheckedChange={setAcknowledgementRequired}
        />
        <span>
          <span className="block text-sm font-medium text-foreground">
            Require acknowledgement
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            The recipient must explicitly acknowledge the alert; opening it only
            marks it as read.
          </span>
        </span>
      </label>
      <Field
        label="Response deadline"
        className="sm:col-span-2"
        hint="When overdue, it is highlighted for you in Sent. Add an escalation recipient below to notify another staff member automatically."
        error={!dueIsValid ? "Choose a future date and time." : undefined}
      >
        <Input
          type="datetime-local"
          min={dateTimeLocalValue(new Date(Date.now() + 60_000))}
          value={dueAt}
          onChange={event => {
            setDueAt(event.target.value);
            if (!event.target.value) {
              setEscalationRoleId("");
              setEscalationRecipientId("");
            }
          }}
        />
      </Field>
      {dueAt ? (
        <div className="grid gap-3 rounded-xl border border-border bg-surface-subtle p-3 sm:col-span-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-foreground">
              Automatic escalation
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              If the original recipient has not read this alert—or acknowledged
              it when required—by the deadline, the selected person receives it
              in their Inbox.
            </p>
          </div>
          <Field label="Escalation role">
            <SelectField
              value={escalationRoleId}
              onChange={event => {
                setEscalationRoleId(event.target.value);
                setEscalationRecipientId("");
              }}
            >
              <option value="">No automatic escalation</option>
              {composer?.roles
                .filter(role => ipdRoleIds.has(role.id))
                .map(role => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
            </SelectField>
          </Field>
          <Field
            label="Escalate to"
            hint="The original recipient and sender are excluded."
          >
            <SelectField
              value={
                escalationRecipientIsAvailable ? escalationRecipientId : ""
              }
              disabled={!escalationRoleId}
              onChange={event => {
                setEscalationRecipientId(event.target.value);
                if (
                  event.target.value &&
                  priority !== "HIGH" &&
                  priority !== "CRITICAL"
                )
                  setPriority("HIGH");
              }}
            >
              <option value="">
                {escalationRoleId ? "Choose a person" : "Choose a role first"}
              </option>
              {escalationStaff.map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.label}
                  {staff.onDuty ? " · on duty" : ""}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>
      ) : null}
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
