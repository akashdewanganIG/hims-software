"use client";

import * as React from "react";

import { PatientPicker } from "@/components/shared/patient-picker";
import { Field } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import {
  PatientFormDialog,
  prefillFromText,
} from "@/features/patients/patient-form-dialog";
import { useAction } from "@/lib/api/client";
import { formatINR, formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { AppointmentType, BookingSource, ID } from "@/lib/sim/schema";
import { isoDate } from "@/lib/sim/time";
import { cn } from "@/lib/utils";

import {
  useDoctorOptions,
  useDoctorSlots,
  type DoctorOption,
  type PatientOption,
} from "./api";

const AVAILABILITY_LABEL: Record<DoctorOption["availability"], string> = {
  AVAILABLE: "",
  UNROSTERED: " · roster not published",
  OFF: " · off duty",
  LEAVE: " · on leave",
  INACTIVE: " · inactive",
};

function DoctorSelect({
  doctors,
  value,
  onChange,
  departmentId,
}: {
  doctors: DoctorOption[];
  value: string;
  onChange: (id: string) => void;
  departmentId?: string;
}) {
  const list = departmentId
    ? doctors.filter(d => d.departmentId === departmentId)
    : doctors;
  return (
    <SelectField
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Doctor"
    >
      <option value="">Choose a doctor…</option>
      {list.map(d => (
        <option
          key={d.id}
          value={d.id}
          disabled={d.availability === "LEAVE" || d.availability === "INACTIVE"}
        >
          {`${d.name} — ${d.department}${AVAILABILITY_LABEL[d.availability]}`}
        </option>
      ))}
    </SelectField>
  );
}

function toOption(p: {
  id: ID;
  uhid: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: PatientOption["gender"];
  dateOfBirth: string;
}): PatientOption {
  const age = Math.floor(
    (Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 86_400_000)
  );
  return {
    id: p.id,
    uhid: p.uhid,
    name: `${p.firstName} ${p.lastName}`,
    phone: p.phone,
    gender: p.gender,
    age,
  };
}

export function BookAppointmentDialog({
  open,
  onOpenChange,
  initialPatient,
  initialDoctorId,
  enquiry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPatient?: PatientOption | null;
  initialDoctorId?: ID;
  /** Convert this enquiry: books through the enquiry so both stay linked. */
  enquiry?: {
    id: ID;
    code: string;
    reason: string;
    departmentId?: ID;
    prospectName: string;
    phone: string;
  };
}) {
  const today = isoDate(new Date());
  const canRegister = useSession().can("patient.register");
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [departmentId, setDepartmentId] = React.useState("");
  const [doctorId, setDoctorId] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [slot, setSlot] = React.useState("");
  const [type, setType] = React.useState<AppointmentType>("NEW");
  const [source, setSource] = React.useState<BookingSource>("PHONE");
  const [reason, setReason] = React.useState("");
  const [registerText, setRegisterText] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPatient(initialPatient ?? null);
    setDoctorId(initialDoctorId ?? "");
    setDepartmentId(enquiry?.departmentId ?? "");
    setDate(today);
    setSlot("");
    setType("NEW");
    setSource(enquiry ? "ENQUIRY" : "PHONE");
    setReason(enquiry?.reason ?? "");
    setShowErrors(false);
  }, [open, initialPatient, initialDoctorId, today, enquiry]);

  const { data: doctors = [] } = useDoctorOptions(date);
  const doctor = doctors.find(d => d.id === doctorId);
  const { data: slots = [], isLoading: slotsLoading } = useDoctorSlots(
    doctorId || undefined,
    date
  );
  const departments = [
    ...new Map(doctors.map(d => [d.departmentId, d.department])).entries(),
  ];
  const blocked =
    doctor &&
    (doctor.availability === "OFF" || doctor.availability === "LEAVE");

  React.useEffect(() => setSlot(""), [doctorId, date]);

  const booked = {
    success: (a: { code: string; scheduledAt: string }) =>
      `Appointment ${a.code} booked for ${formatTime(a.scheduledAt)}`,
    onSuccess: () => onOpenChange(false),
  };
  const convert = useAction(
    "enquiry.convert",
    () => ({
      enquiryId: enquiry!.id,
      patientId: patient!.id,
      doctorId,
      scheduledAt: slot,
      type,
    }),
    booked
  );
  const direct = useAction(
    "appointment.book",
    () => ({
      patientId: patient!.id,
      doctorId,
      scheduledAt: slot,
      type,
      source: source as "PHONE" | "ONLINE" | "FOLLOW_UP",
      reason,
    }),
    booked
  );
  const book = enquiry ? convert : direct;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!patient || !doctorId || !slot || !reason.trim()) return;
    book.mutate();
  };

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          enquiry
            ? `Convert ${enquiry.code} to an appointment`
            : "Book appointment"
        }
        description={
          enquiry
            ? "The appointment stays linked to the enquiry; the enquiry converts when the visit is completed."
            : "Slots follow the doctor's published roster in WFM."
        }
        size="xl"
        onSubmit={submit}
        isSubmitting={book.isPending}
        submitLabel={enquiry ? "Book & link enquiry" : "Book appointment"}
        bodyClassName="gap-4"
      >
        <Field
          label="Patient"
          required
          error={
            showErrors && !patient
              ? "Select or register the patient"
              : undefined
          }
        >
          <PatientPicker
            value={patient}
            onChange={setPatient}
            onRegisterNew={
              canRegister ? text => setRegisterText(text) : undefined
            }
            invalid={showErrors && !patient}
            autoFocus
          />
        </Field>
        {enquiry && !patient ? (
          <Alert
            tone="info"
            title={`${enquiry.prospectName} is not registered yet`}
            action={
              canRegister ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRegisterText(`${enquiry.prospectName}`)}
                >
                  Register now
                </Button>
              ) : undefined
            }
          >
            Search by {enquiry.phone} in case they are already on file
            {canRegister
              ? ", or register them as a new patient."
              : ". Registration is done at the front desk."}
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-[12rem_1fr_10rem]">
          <Field label="Department">
            <SelectField
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field
            label="Doctor"
            required
            error={showErrors && !doctorId ? "Choose a doctor" : undefined}
            hint={
              doctor
                ? `${doctor.specialisation ?? doctor.department} · consultation ${formatINR(doctor.fee)}`
                : undefined
            }
          >
            <DoctorSelect
              doctors={doctors}
              value={doctorId}
              onChange={setDoctorId}
              departmentId={departmentId || undefined}
            />
          </Field>
          <Field label="Date" required>
            <Input
              type="date"
              min={today}
              value={date}
              onChange={e => setDate(e.target.value || today)}
            />
          </Field>
        </div>

        {blocked ? (
          <Alert
            tone="warning"
            title={`${doctor!.name} is ${doctor!.availability === "LEAVE" ? "on leave" : "not rostered"} on this date`}
          >
            Pick another date or doctor. Rosters are maintained in WFM.
          </Alert>
        ) : null}

        <Field
          label="Time slot"
          required
          error={
            showErrors && !slot && doctorId ? "Pick a free slot" : undefined
          }
        >
          {!doctorId ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Choose a doctor to see free slots.
            </p>
          ) : slotsLoading ? (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              Loading slots…
            </p>
          ) : slots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No OPD slots on this date.
            </p>
          ) : (
            <div
              className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8"
              role="radiogroup"
              aria-label="Time slot"
            >
              {slots.map(s => {
                const disabled = s.taken || s.past || Boolean(blocked);
                const selected = slot === s.iso;
                return (
                  <button
                    key={s.iso}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => setSlot(s.iso)}
                    title={
                      s.taken
                        ? "Already booked"
                        : s.past
                          ? "In the past"
                          : undefined
                    }
                    className={cn(
                      "h-8 rounded-md border text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-subtle",
                      disabled &&
                        "cursor-not-allowed border-border-subtle bg-surface-secondary text-text-disabled line-through hover:bg-surface-secondary"
                    )}
                  >
                    {formatTime(s.iso)}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr]">
          <Field label="Visit type">
            <SelectField
              value={type}
              onChange={e => setType(e.target.value as AppointmentType)}
            >
              <option value="NEW">New consultation</option>
              <option value="FOLLOW_UP">Follow-up (50% fee)</option>
              <option value="REFERRAL">Referral</option>
            </SelectField>
          </Field>
          <Field label="Booked via">
            <SelectField
              value={source}
              disabled={Boolean(enquiry)}
              onChange={e => setSource(e.target.value as BookingSource)}
            >
              {enquiry ? <option value="ENQUIRY">Enquiry</option> : null}
              <option value="PHONE">Phone</option>
              <option value="ONLINE">Online</option>
              <option value="FOLLOW_UP">Follow-up desk</option>
            </SelectField>
          </Field>
          <Field
            label="Reason for visit"
            required
            error={
              showErrors && !reason.trim()
                ? "Add the reason for the visit"
                : undefined
            }
          >
            <Input
              value={reason}
              readOnly={Boolean(enquiry)}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Fever for 3 days"
              aria-invalid={showErrors && !reason.trim()}
            />
          </Field>
        </div>
      </FormDialog>

      <PatientFormDialog
        open={registerText !== null}
        onOpenChange={next => !next && setRegisterText(null)}
        prefill={
          registerText
            ? {
                ...prefillFromText(registerText),
                ...(enquiry ? { phone: enquiry.phone } : {}),
              }
            : undefined
        }
        onSaved={p => setPatient(toOption(p))}
      />
    </>
  );
}

export function WalkInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = isoDate(new Date());
  const canRegister = useSession().can("patient.register");
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [doctorId, setDoctorId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [type, setType] = React.useState<AppointmentType>("NEW");
  const [registerText, setRegisterText] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const { data: doctors = [] } = useDoctorOptions(today);
  const available = doctors.filter(
    d => d.availability === "AVAILABLE" || d.availability === "UNROSTERED"
  );

  React.useEffect(() => {
    if (!open) return;
    setPatient(null);
    setDoctorId("");
    setReason("");
    setType("NEW");
    setShowErrors(false);
  }, [open]);

  const walkIn = useAction(
    "appointment.walkIn",
    () => ({ patientId: patient!.id, doctorId, reason, type }),
    {
      success: r => `Checked in — token ${r.appointment.tokenNumber}`,
      onSuccess: () => onOpenChange(false),
    }
  );

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Walk-in patient"
        description="Books the current slot and checks the patient in: a queue token is issued and the consultation bill is raised."
        size="lg"
        isSubmitting={walkIn.isPending}
        submitLabel="Check in"
        onSubmit={event => {
          event.preventDefault();
          setShowErrors(true);
          if (patient && doctorId && reason.trim()) walkIn.mutate();
        }}
      >
        <Field
          label="Patient"
          required
          error={
            showErrors && !patient
              ? "Select or register the patient"
              : undefined
          }
        >
          <PatientPicker
            value={patient}
            onChange={setPatient}
            onRegisterNew={
              canRegister ? text => setRegisterText(text) : undefined
            }
            invalid={showErrors && !patient}
            autoFocus
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
          <Field
            label="Doctor on duty today"
            required
            error={showErrors && !doctorId ? "Choose a doctor" : undefined}
          >
            <DoctorSelect
              doctors={available}
              value={doctorId}
              onChange={setDoctorId}
            />
          </Field>
          <Field label="Visit type">
            <SelectField
              value={type}
              onChange={e => setType(e.target.value as AppointmentType)}
            >
              <option value="NEW">New consultation</option>
              <option value="FOLLOW_UP">Follow-up</option>
            </SelectField>
          </Field>
        </div>
        <Field
          label="Presenting complaint"
          required
          error={
            showErrors && !reason.trim()
              ? "Add the presenting complaint"
              : undefined
          }
        >
          <Textarea
            className="min-h-16"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Cough and fever since 2 days"
          />
        </Field>
      </FormDialog>
      <PatientFormDialog
        open={registerText !== null}
        onOpenChange={next => !next && setRegisterText(null)}
        prefill={registerText ? prefillFromText(registerText) : undefined}
        onSaved={p => setPatient(toOption(p))}
      />
    </>
  );
}
