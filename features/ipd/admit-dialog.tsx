"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { PatientPicker } from "@/components/shared/patient-picker";
import { Field } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { useDoctorOptions, type PatientOption } from "@/features/opd/api";
import {
  PatientFormDialog,
  prefillFromText,
} from "@/features/patients/patient-form-dialog";
import { useAction } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import { ADMISSION_FEE, NURSING_CHARGE_PER_DAY } from "@/lib/domain/ipd";
import { formatINR, humanize } from "@/lib/format";
import type { AdmissionSource, ID } from "@/lib/sim/schema";
import { isoDate } from "@/lib/sim/time";

import { bedFits, useFreeBeds } from "./api";

export interface AdmitPrefill {
  patient?: PatientOption | null;
  doctorId?: ID;
  bedId?: ID;
  source?: AdmissionSource;
  sourceEncounterId?: ID;
  reason?: string;
  diagnosis?: string;
}

/**
 * Admission: registers the IPD encounter, occupies the chosen bed, opens the
 * running bill and the IPD case file — one atomic step.
 */
export function AdmitDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: AdmitPrefill;
}) {
  const router = useRouter();
  const today = isoDate(new Date());
  const canRegister = useSession().can("patient.register");
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [doctorId, setDoctorId] = React.useState("");
  const [bedId, setBedId] = React.useState("");
  const [source, setSource] = React.useState<AdmissionSource>("DIRECT");
  const [reason, setReason] = React.useState("");
  const [diagnosis, setDiagnosis] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const [registerText, setRegisterText] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const { data: doctors = [] } = useDoctorOptions(today);
  const { data: beds = [] } = useFreeBeds();

  React.useEffect(() => {
    if (!open) return;
    setPatient(prefill?.patient ?? null);
    setDoctorId(prefill?.doctorId ?? "");
    setBedId(prefill?.bedId ?? "");
    setSource(prefill?.source ?? "DIRECT");
    setReason(prefill?.reason ?? "");
    setDiagnosis(prefill?.diagnosis ?? "");
    setExpected("");
    setShowErrors(false);
  }, [open, prefill]);

  // Only beds whose ward can take this patient (gender wards, paediatrics).
  const suitable = React.useMemo(
    () => beds.filter(b => bedFits(b, patient) || b.id === prefill?.bedId),
    [beds, patient, prefill?.bedId]
  );
  const wards = React.useMemo(() => {
    const map = new Map<string, typeof beds>();
    for (const bed of suitable)
      map.set(bed.ward, [...(map.get(bed.ward) ?? []), bed]);
    return [...map.entries()];
  }, [suitable]);
  const bed = beds.find(b => b.id === bedId);
  const unsuitable = Boolean(bed && patient && !bedFits(bed, patient));

  const admit = useAction(
    "ipd.admit",
    () => ({
      patientId: patient!.id,
      doctorId,
      bedId,
      reason,
      provisionalDiagnosis: diagnosis,
      source,
      sourceEncounterId: prefill?.sourceEncounterId,
      expectedDischargeDate: expected || undefined,
    }),
    {
      success: a => `Admitted as ${a.code}`,
      onSuccess: a => {
        onOpenChange(false);
        router.push(`/ipd/${a.id}`);
      },
    }
  );

  const missing =
    !patient || !doctorId || !bedId || !reason.trim() || !diagnosis.trim();

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Admit patient"
        description="Occupies the bed, opens the IPD encounter, the running bill and the IPD case file."
        size="lg"
        submitLabel="Admit"
        isSubmitting={admit.isPending}
        onSubmit={event => {
          event.preventDefault();
          setShowErrors(true);
          if (!missing) admit.mutate();
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
          {prefill?.patient ? (
            <PatientPicker value={patient} onChange={() => undefined} />
          ) : (
            <PatientPicker
              value={patient}
              onChange={setPatient}
              onRegisterNew={
                canRegister ? text => setRegisterText(text) : undefined
              }
              invalid={showErrors && !patient}
              autoFocus
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Admitting doctor"
            required
            error={
              showErrors && !doctorId
                ? "Choose the admitting doctor"
                : undefined
            }
          >
            <SelectField
              value={doctorId}
              onChange={e => setDoctorId(e.target.value)}
            >
              <option value="">Choose a doctor…</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {`${d.name} — ${d.department}`}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Admission source">
            <SelectField
              value={source}
              onChange={e => setSource(e.target.value as AdmissionSource)}
            >
              <option value="DIRECT">Direct / elective</option>
              <option value="OPD">From OPD</option>
              <option value="REFERRAL">External referral</option>
            </SelectField>
          </Field>
        </div>
        <Field
          label="Bed"
          required
          error={showErrors && !bedId ? "Choose a free bed" : undefined}
          hint={
            bed
              ? `${formatINR(bed.dailyRate)}/day room + ${formatINR(NURSING_CHARGE_PER_DAY)}/day nursing · admission charge ${formatINR(ADMISSION_FEE)}`
              : `${suitable.length} suitable beds free${patient ? "" : " (select the patient to filter by ward)"}`
          }
        >
          <SelectField value={bedId} onChange={e => setBedId(e.target.value)}>
            <option value="">Choose a bed…</option>
            {wards.map(([ward, list]) => (
              <optgroup key={ward} label={ward}>
                {list.map(b => (
                  <option key={b.id} value={b.id}>
                    {`${ward} · ${b.code} · ${humanize(b.category)} · ${formatINR(b.dailyRate)}/day${b.status === "RESERVED" ? " · reserved" : ""}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
        </Field>
        {unsuitable && bed ? (
          <Alert tone="error" title="This bed does not suit the patient">
            {bed.restriction?.gender
              ? `${bed.ward} is for ${bed.restriction.gender.toLowerCase()} patients only.`
              : `${bed.ward} is for children up to ${bed.restriction?.maxAge} years.`}{" "}
            Choose another bed.
          </Alert>
        ) : null}
        {bed?.status === "RESERVED" ? (
          <Alert tone="warning" title="This bed is reserved">
            {bed.note ?? "Reserved for a planned admission."} Admitting here
            uses the reservation.
          </Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Reason for admission"
            required
            error={showErrors && !reason.trim() ? "Required" : undefined}
          >
            <Input value={reason} onChange={e => setReason(e.target.value)} />
          </Field>
          <Field
            label="Provisional diagnosis"
            required
            error={showErrors && !diagnosis.trim() ? "Required" : undefined}
          >
            <Input
              value={diagnosis}
              onChange={e => setDiagnosis(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Expected discharge" className="sm:max-w-[12rem]">
          <Input
            type="date"
            min={today}
            value={expected}
            onChange={e => setExpected(e.target.value)}
          />
        </Field>
      </FormDialog>
      <PatientFormDialog
        open={registerText !== null}
        onOpenChange={next => !next && setRegisterText(null)}
        prefill={registerText ? prefillFromText(registerText) : undefined}
        onSaved={p =>
          setPatient({
            id: p.id,
            uhid: p.uhid,
            name: `${p.firstName} ${p.lastName}`,
            phone: p.phone,
            gender: p.gender,
            age: Math.floor(
              (Date.now() - new Date(p.dateOfBirth).getTime()) /
                (365.25 * 86_400_000)
            ),
          })
        }
      />
    </>
  );
}
