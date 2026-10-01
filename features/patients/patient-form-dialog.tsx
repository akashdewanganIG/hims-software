"use client";

import * as React from "react";
import { z } from "zod";

import { FilePicker } from "@/components/shared/files";
import { Field, FormSection } from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { useAction } from "@/lib/api/client";
import type { PatientInput } from "@/lib/domain/patients";
import {
  BLOOD_GROUPS,
  type BloodGroup,
  type Gender,
  type Patient,
} from "@/lib/sim/schema";
import { isoDate } from "@/lib/sim/time";
import type { PreparedUpload } from "@/lib/uploads";

const phone = z
  .string()
  .transform(v => v.replace(/\D/g, ""))
  .refine(v => v.length === 10, "Enter a 10-digit mobile number");

const schema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .refine(
      v => v <= isoDate(new Date()),
      "Date of birth cannot be in the future"
    ),
  bloodGroup: z.string().optional(),
  phone,
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]),
  address: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().min(1, "City is required"),
  emergencyContactName: z
    .string()
    .trim()
    .min(1, "Emergency contact is required"),
  emergencyContactPhone: phone,
  allergies: z.string(),
  chronicConditions: z.string(),
});

type FormValues = z.input<typeof schema>;

const EMPTY: FormValues = {
  firstName: "",
  lastName: "",
  gender: "FEMALE",
  dateOfBirth: "",
  bloodGroup: "",
  phone: "",
  email: "",
  address: "",
  city: "Pune",
  emergencyContactName: "",
  emergencyContactPhone: "",
  allergies: "",
  chronicConditions: "",
};

function fromPatient(p: Patient): FormValues {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth,
    bloodGroup: p.bloodGroup ?? "",
    phone: p.phone,
    email: p.email ?? "",
    address: p.address,
    city: p.city,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    allergies: p.allergies.join(", "),
    chronicConditions: p.chronicConditions.join(", "),
  };
}

/** Prefill for "register the enquirer" / typed search text. */
export function prefillFromText(text: string): Partial<FormValues> {
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 6) return { phone: digits.slice(-10) };
  const [first = "", ...rest] = text.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  prefill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when provided. */
  patient?: Patient;
  prefill?: Partial<FormValues>;
  onSaved?: (patient: Patient) => void;
}) {
  const [values, setValues] = React.useState<FormValues>(EMPTY);
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormValues, string>>
  >({});
  const [photo, setPhoto] = React.useState<PreparedUpload | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setValues(patient ? fromPatient(patient) : { ...EMPTY, ...prefill });
    setErrors({});
    setPhoto(null);
  }, [open, patient, prefill]);

  const saved = {
    success: (p: Patient) =>
      patient
        ? "Patient details updated"
        : `Registered ${p.firstName} ${p.lastName} · ${p.uhid}`,
    onSuccess: (p: Patient) => {
      onOpenChange(false);
      onSaved?.(p);
    },
  };
  const register = useAction(
    "patient.register",
    (input: PatientInput) => ({
      ...input,
      photo: photo ? { name: photo.name, data: photo.data } : undefined,
    }),
    saved
  );
  const update = useAction(
    "patient.update",
    (input: PatientInput) => ({ patientId: patient!.id, patient: input }),
    saved
  );
  const save = patient ? update : register;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormValues;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    const v = parsed.data;
    const list = (text: string) =>
      text
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    save.mutate({
      firstName: v.firstName,
      lastName: v.lastName,
      gender: v.gender as Gender,
      dateOfBirth: v.dateOfBirth,
      bloodGroup: (v.bloodGroup || undefined) as BloodGroup | undefined,
      phone: v.phone,
      email: v.email || undefined,
      address: v.address,
      city: v.city,
      emergencyContactName: v.emergencyContactName,
      emergencyContactPhone: v.emergencyContactPhone,
      allergies: list(v.allergies),
      chronicConditions: list(v.chronicConditions),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        patient
          ? `Edit ${patient.firstName} ${patient.lastName}`
          : "Register patient"
      }
      description={
        patient
          ? `${patient.uhid} · changes apply everywhere this patient appears.`
          : "Creates one patient record (UHID) shared by every module."
      }
      size="lg"
      onSubmit={submit}
      isSubmitting={save.isPending}
      submitLabel={patient ? "Save changes" : "Register patient"}
      bodyClassName="gap-5"
    >
      <FormSection title="Identity">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required error={errors.firstName}>
            <Input
              value={values.firstName}
              aria-invalid={!!errors.firstName}
              onChange={e => set("firstName", e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <Input
              value={values.lastName}
              aria-invalid={!!errors.lastName}
              onChange={e => set("lastName", e.target.value)}
            />
          </Field>
          <Field label="Gender" required>
            <SelectField
              value={values.gender}
              onChange={e =>
                set("gender", e.target.value as FormValues["gender"])
              }
            >
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
            </SelectField>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth" required error={errors.dateOfBirth}>
              <Input
                type="date"
                max={isoDate(new Date())}
                value={values.dateOfBirth}
                aria-invalid={!!errors.dateOfBirth}
                onChange={e => set("dateOfBirth", e.target.value)}
              />
            </Field>
            <Field label="Blood group">
              <SelectField
                value={values.bloodGroup ?? ""}
                onChange={e => set("bloodGroup", e.target.value)}
              >
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>
        </div>
      </FormSection>

      <FormSection title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mobile" required error={errors.phone}>
            <Input
              inputMode="tel"
              value={values.phone}
              aria-invalid={!!errors.phone}
              onChange={e => set("phone", e.target.value)}
              placeholder="10-digit mobile"
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              value={values.email}
              aria-invalid={!!errors.email}
              onChange={e => set("email", e.target.value)}
            />
          </Field>
          <Field
            label="Address"
            required
            error={errors.address}
            className="sm:col-span-2"
          >
            <Input
              value={values.address}
              aria-invalid={!!errors.address}
              onChange={e => set("address", e.target.value)}
            />
          </Field>
          <Field label="City" required error={errors.city}>
            <Input
              value={values.city}
              aria-invalid={!!errors.city}
              onChange={e => set("city", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Emergency contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required error={errors.emergencyContactName}>
            <Input
              value={values.emergencyContactName}
              aria-invalid={!!errors.emergencyContactName}
              onChange={e => set("emergencyContactName", e.target.value)}
            />
          </Field>
          <Field label="Mobile" required error={errors.emergencyContactPhone}>
            <Input
              inputMode="tel"
              value={values.emergencyContactPhone}
              aria-invalid={!!errors.emergencyContactPhone}
              onChange={e => set("emergencyContactPhone", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Clinical flags"
        description="Separate entries with commas. Allergies are checked on every prescription."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Allergies">
            <Input
              value={values.allergies}
              onChange={e => set("allergies", e.target.value)}
              placeholder="e.g. Penicillin, NSAID"
            />
          </Field>
          <Field label="Chronic conditions">
            <Input
              value={values.chronicConditions}
              onChange={e => set("chronicConditions", e.target.value)}
              placeholder="e.g. Hypertension"
            />
          </Field>
        </div>
      </FormSection>

      {patient ? null : (
        <FormSection
          title="Photo"
          description="Optional. Helps the front desk and wards identify the patient; it can be added or changed later from the record."
        >
          <FilePicker
            purpose="photo"
            value={photo}
            onChange={setPhoto}
            label="Patient photo"
          />
        </FormSection>
      )}
    </FormDialog>
  );
}
