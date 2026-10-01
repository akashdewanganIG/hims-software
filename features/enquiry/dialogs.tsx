"use client";

import * as React from "react";

import { PatientPicker } from "@/components/shared/patient-picker";
import { Field, FormSection } from "@/components/shared/page";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import {
  useDepartments,
  useStaffOptions,
  type PatientOption,
} from "@/features/opd/api";
import { useAction } from "@/lib/api/client";
import { humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  ENQUIRY_SOURCES,
  FOLLOW_UP_CHANNELS,
  type Enquiry,
  type EnquirySource,
  type EnquiryType,
  type FollowUpChannel,
  type ID,
} from "@/lib/sim/schema";
import { addDaysIso, isoDate } from "@/lib/sim/time";

export function EnquiryFormDialog({
  open,
  onOpenChange,
  enquiry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry?: Enquiry;
  onSaved?: (id: ID) => void;
}) {
  const { staff } = useSession();
  const { data: departments = [] } = useDepartments();
  const { data: people = [] } = useStaffOptions();
  const doctors = people.filter(p => p.role === "DOCTOR");
  const desk = people.filter(
    p =>
      p.role === "RECEPTIONIST" ||
      p.role === "OPERATIONS_MANAGER" ||
      p.role === "ADMINISTRATOR"
  );
  const [type, setType] = React.useState<EnquiryType>("EXTERNAL");
  const [existing, setExisting] = React.useState(false);
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [form, setForm] = React.useState({
    prospectName: "",
    phone: "",
    email: "",
    source: "PHONE" as EnquirySource,
    reason: "",
    departmentId: "",
    preferredDoctorId: "",
    assignedToId: "",
    referredById: "",
    notes: "",
    followUpDate: "",
  });
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    if (enquiry) {
      setType(enquiry.type);
      setForm({
        prospectName: enquiry.prospectName,
        phone: enquiry.phone,
        email: enquiry.email ?? "",
        source: enquiry.source,
        reason: enquiry.reason,
        departmentId: enquiry.departmentId ?? "",
        preferredDoctorId: enquiry.preferredDoctorId ?? "",
        assignedToId: enquiry.assignedToId,
        referredById: enquiry.referredById ?? "",
        notes: enquiry.notes,
        followUpDate: enquiry.followUpDate ?? "",
      });
    } else {
      setType("EXTERNAL");
      setExisting(false);
      setPatient(null);
      setForm({
        prospectName: "",
        phone: "",
        email: "",
        source: "PHONE",
        reason: "",
        departmentId: "",
        preferredDoctorId: "",
        assignedToId: staff?.id ?? "",
        referredById: "",
        notes: "",
        followUpDate: "",
      });
    }
  }, [open, enquiry, staff]);

  const set = (key: keyof typeof form, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  const saved = {
    success: (e: { code: string }) =>
      enquiry ? "Enquiry updated" : `Enquiry ${e.code} logged`,
    onSuccess: (e: { id: ID }) => {
      onOpenChange(false);
      onSaved?.(e.id);
    },
  };
  const update = useAction(
    "enquiry.update",
    () => ({
      enquiryId: enquiry!.id,
      reason: form.reason,
      departmentId: form.departmentId,
      preferredDoctorId: form.preferredDoctorId,
      assignedToId: form.assignedToId,
      notes: form.notes,
      email: form.email,
    }),
    saved
  );
  const create = useAction(
    "enquiry.create",
    () => ({
      type,
      patientId: existing || type === "INTERNAL" ? patient?.id : undefined,
      prospectName: form.prospectName,
      phone: form.phone,
      email: form.email,
      source:
        type === "INTERNAL"
          ? ("DEPARTMENT_REFERRAL" as const)
          : (form.source as EnquirySource),
      reason: form.reason,
      departmentId: form.departmentId,
      preferredDoctorId: form.preferredDoctorId,
      assignedToId: form.assignedToId,
      referredById: form.referredById,
      notes: form.notes,
      followUpDate: form.followUpDate,
    }),
    saved
  );
  const save = enquiry ? update : create;

  const needsPatient = !enquiry && (existing || type === "INTERNAL");
  const invalid =
    !form.reason.trim() ||
    !form.assignedToId ||
    (needsPatient
      ? !patient
      : !enquiry &&
        (!form.prospectName.trim() ||
          form.phone.replace(/\D/g, "").length !== 10)) ||
    (type === "INTERNAL" && !enquiry && !form.referredById);
  const doctorList = form.departmentId
    ? doctors.filter(d => d.departmentId === form.departmentId)
    : doctors;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={enquiry ? `Edit ${enquiry.code}` : "New enquiry"}
      description={
        enquiry
          ? undefined
          : "Log an external enquiry (call, website, walk-in) or an internal referral for an existing patient."
      }
      size="lg"
      submitLabel={enquiry ? "Save" : "Log enquiry"}
      isSubmitting={save.isPending}
      onSubmit={event => {
        event.preventDefault();
        setShowErrors(true);
        if (!invalid) save.mutate();
      }}
      bodyClassName="gap-5"
    >
      {!enquiry ? (
        <div className="flex flex-wrap items-center gap-3">
          <CategorySwitcher
            label="Enquiry type"
            value={type}
            onValueChange={setType}
            items={[
              { value: "EXTERNAL", label: "External" },
              { value: "INTERNAL", label: "Internal referral" },
            ]}
          />
          {type === "EXTERNAL" ? (
            <label className="flex items-center gap-2 text-[0.8125rem]">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={existing}
                onChange={e => setExisting(e.target.checked)}
              />
              Existing patient
            </label>
          ) : null}
        </div>
      ) : null}

      <FormSection title={needsPatient ? "Patient" : "Enquirer"}>
        {needsPatient ? (
          <Field
            label="Patient"
            required
            error={showErrors && !patient ? "Select the patient" : undefined}
          >
            <PatientPicker
              value={patient}
              onChange={setPatient}
              invalid={showErrors && !patient}
            />
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Name"
              required
              error={
                showErrors && !form.prospectName.trim() ? "Required" : undefined
              }
            >
              <Input
                readOnly={Boolean(enquiry)}
                value={form.prospectName}
                onChange={e => set("prospectName", e.target.value)}
              />
            </Field>
            <Field
              label="Mobile"
              required
              error={
                showErrors && form.phone.replace(/\D/g, "").length !== 10
                  ? "10-digit mobile"
                  : undefined
              }
            >
              <Input
                readOnly={Boolean(enquiry)}
                inputMode="tel"
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
              />
            </Field>
          </div>
        )}
      </FormSection>

      <FormSection title="Enquiry">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Reason"
            required
            className="sm:col-span-2"
            error={showErrors && !form.reason.trim() ? "Required" : undefined}
          >
            <Input
              value={form.reason}
              onChange={e => set("reason", e.target.value)}
              placeholder="e.g. Knee pain — wants an orthopaedic opinion"
            />
          </Field>
          {type === "EXTERNAL" && !enquiry ? (
            <Field label="Source">
              <SelectField
                value={form.source}
                onChange={e => set("source", e.target.value)}
              >
                {ENQUIRY_SOURCES.filter(s => s !== "DEPARTMENT_REFERRAL").map(
                  s => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  )
                )}
              </SelectField>
            </Field>
          ) : null}
          {type === "INTERNAL" && !enquiry ? (
            <Field
              label="Referred by"
              required
              error={showErrors && !form.referredById ? "Required" : undefined}
            >
              <SelectField
                value={form.referredById}
                onChange={e => set("referredById", e.target.value)}
              >
                <option value="">Choose a doctor…</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>
                    {`${d.name} — ${d.department}`}
                  </option>
                ))}
              </SelectField>
            </Field>
          ) : null}
          <Field label="Department">
            <SelectField
              value={form.departmentId}
              onChange={e => set("departmentId", e.target.value)}
            >
              <option value="">Not decided</option>
              {departments
                .filter(d => d.kind === "CLINICAL")
                .map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </SelectField>
          </Field>
          <Field label="Preferred doctor">
            <SelectField
              value={form.preferredDoctorId}
              onChange={e => set("preferredDoctorId", e.target.value)}
            >
              <option value="">Any</option>
              {doctorList.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Assigned to" required>
            <SelectField
              value={form.assignedToId}
              onChange={e => set("assignedToId", e.target.value)}
            >
              <option value="">Choose…</option>
              {desk.map(d => (
                <option key={d.id} value={d.id}>
                  {`${d.name} — ${d.designation}`}
                </option>
              ))}
            </SelectField>
          </Field>
          {!enquiry ? (
            <Field
              label="Follow up on"
              hint="Leave blank if no call-back is needed"
            >
              <Input
                type="date"
                min={isoDate(new Date())}
                value={form.followUpDate}
                onChange={e => set("followUpDate", e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              className="min-h-16"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>
    </FormDialog>
  );
}

export function FollowUpDialog({
  open,
  onOpenChange,
  enquiryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiryId: ID;
}) {
  const [channel, setChannel] = React.useState<FollowUpChannel>("CALL");
  const [note, setNote] = React.useState("");
  const [next, setNext] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setChannel("CALL");
    setNote("");
    setNext(addDaysIso(isoDate(new Date()), 2));
  }, [open]);
  const save = useAction(
    "enquiry.followUp",
    () => ({
      enquiryId,
      channel,
      note,
      nextFollowUpDate: next || undefined,
    }),
    {
      success: "Follow-up recorded",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record follow-up"
      size="md"
      submitLabel="Save follow-up"
      isSubmitting={save.isPending}
      submitDisabled={!note.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel">
          <SelectField
            value={channel}
            onChange={e => setChannel(e.target.value as FollowUpChannel)}
          >
            {FOLLOW_UP_CHANNELS.map(c => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Next follow-up" hint="Clear if none needed">
          <Input
            type="date"
            min={isoDate(new Date())}
            value={next}
            onChange={e => setNext(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Outcome" required>
        <Textarea
          autoFocus
          className="min-h-20"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What was discussed and agreed"
        />
      </Field>
    </FormDialog>
  );
}

export function RescheduleFollowUpDialog({
  open,
  onOpenChange,
  enquiryId,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiryId: ID;
  current?: string;
}) {
  const [date, setDate] = React.useState("");
  React.useEffect(() => {
    if (open) setDate(current ?? addDaysIso(isoDate(new Date()), 1));
  }, [open, current]);
  const save = useAction(
    "enquiry.reschedule",
    () => ({ enquiryId, followUpDate: date }),
    {
      success: "Follow-up rescheduled",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reschedule follow-up"
      size="sm"
      submitLabel="Reschedule"
      isSubmitting={save.isPending}
      submitDisabled={!date}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Follow up on">
        <Input
          type="date"
          min={isoDate(new Date())}
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

export function ReasonDialog({
  open,
  onOpenChange,
  enquiryId,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiryId: ID;
  mode: "cancel" | "close";
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const done = {
    success: mode === "cancel" ? "Enquiry cancelled" : "Enquiry closed",
    onSuccess: () => onOpenChange(false),
  };
  const cancel = useAction(
    "enquiry.cancel",
    () => ({ enquiryId, reason }),
    done
  );
  const close = useAction(
    "enquiry.close",
    () => ({ enquiryId, note: reason }),
    done
  );
  const save = mode === "cancel" ? cancel : close;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "cancel" ? "Cancel enquiry" : "Close enquiry"}
      description={
        mode === "cancel"
          ? "A scheduled appointment linked to it is cancelled too."
          : "Use when the enquirer's need was met without an appointment."
      }
      size="sm"
      submitLabel={mode === "cancel" ? "Cancel enquiry" : "Close enquiry"}
      cancelLabel="Back"
      isSubmitting={save.isPending}
      submitDisabled={!reason.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label={mode === "cancel" ? "Reason" : "Closing note"} required>
        <Input
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
