"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  CheckCircle2,
  Flask,
  Heartbeat,
  Pill,
  Printer,
  Stethoscope,
} from "@/components/icons";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { EntityLink, RefCode } from "@/components/shared/entity";
import {
  DetailRow,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  StatusBadge,
} from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdmittedNotice,
  LabOrderCard,
  PatientBanner,
  PrescriptionCard,
  VitalsGrid,
} from "@/features/clinical/components";
import { AdmitDialog } from "@/features/ipd/admit-dialog";
import { useDepartments, useVisit } from "@/features/opd/api";
import {
  ConsultationForm,
  toConsultationInput,
} from "@/features/opd/consultation-form";
import { LabOrderForm } from "@/features/opd/lab-order-form";
import { PrescriptionBuilder } from "@/features/opd/prescription-builder";
import { VitalsDialog } from "@/features/opd/vitals-dialog";
import { useAction } from "@/lib/api/client";
import type { ConsultationInput } from "@/lib/domain/opd";
import {
  formatDateShort,
  formatDuration,
  formatINR,
  formatTime,
  humanize,
} from "@/lib/format";
import { pdfName } from "@/lib/pdf/layout";
import { prescriptionPdf } from "@/lib/pdf/records";
import { useSession } from "@/lib/session";
import type { OpdDisposition } from "@/lib/sim/schema";
import { minutesBetween } from "@/lib/sim/time";

export default function VisitPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: visit, isLoading, error } = useVisit(id);
  const { data: departments = [] } = useDepartments();

  const [draft, setDraft] = React.useState<ConsultationInput | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [vitalsOpen, setVitalsOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [admitOpen, setAdmitOpen] = React.useState(false);
  const [showRx, setShowRx] = React.useState(false);
  const [showLab, setShowLab] = React.useState(false);

  React.useEffect(() => {
    if (visit && !dirty) setDraft(toConsultationInput(visit.encounter));
  }, [visit, dirty]);

  const status = visit?.appointment?.status;
  const open = visit?.encounter.status === "OPEN";
  const consulting = open && status === "IN_CONSULTATION";
  const canConsult = can("opd.consult");
  const editable = Boolean(consulting && canConsult);

  const start = useAction(
    "opd.startConsultation",
    () => ({ appointmentId: visit!.appointment!.id }),
    { success: "Consultation started" }
  );
  const save = useAction(
    "opd.saveConsultation",
    (input: ConsultationInput) => ({ encounterId: id, consultation: input }),
    {
      success: "Consultation notes saved",
      onSuccess: () => setDirty(false),
    }
  );

  if (isLoading || (visit && !draft)) {
    return (
      <PageShell>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <PanelRowsSkeleton rows={8} />
          <PanelRowsSkeleton rows={6} />
        </div>
      </PageShell>
    );
  }
  if (error || !visit || !draft) {
    return (
      <PageShell>
        <ErrorBanner error={error} />
        <EmptyState
          title="Visit not found"
          description="It may belong to a reset simulation."
          action={
            <Button asChild variant="outline">
              <Link href="/opd">Back to the OPD queue</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const { encounter, appointment, patient } = visit;
  const wait = appointment?.checkedInAt
    ? minutesBetween(
        appointment.checkedInAt,
        appointment.consultationStartedAt ?? new Date().toISOString()
      )
    : undefined;

  return (
    <PageShell>
      <PageHeader
        title={`OPD visit ${encounter.code}`}
        breadcrumb={[
          { label: "OPD", href: "/opd" },
          { label: "Queue", href: "/opd" },
          { label: encounter.code },
        ]}
      />

      <PatientBanner
        patient={patient}
        recordHref={`/patients/${patient.id}`}
        badges={
          <>
            <StatusBadge status={status ?? encounter.status} />
            {appointment?.tokenNumber ? (
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                Token {appointment.tokenNumber}
              </span>
            ) : null}
          </>
        }
        meta={
          <span>
            {visit.doctor.name} · {visit.department}
          </span>
        }
        actions={
          <>
            {open && can("opd.vitals") ? (
              <Button variant="outline" onClick={() => setVitalsOpen(true)}>
                <Heartbeat className="size-4" />
                {encounter.vitals ? "Update vitals" : "Record vitals"}
              </Button>
            ) : null}
            {open && status === "CHECKED_IN" && canConsult ? (
              <Button onClick={() => start.mutate()} disabled={start.isPending}>
                <Stethoscope className="size-4" />
                Start consultation
              </Button>
            ) : null}
            {editable ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => save.mutate(draft)}
                  disabled={!dirty || save.isPending}
                >
                  {save.isPending ? "Saving…" : dirty ? "Save notes" : "Saved"}
                </Button>
                <Button variant="raised" onClick={() => setCloseOpen(true)}>
                  <CheckCircle2 className="size-4" />
                  Close visit
                </Button>
              </>
            ) : null}
            {status === "IN_CONSULTATION" || !open ? (
              <>
                <DownloadPdfButton
                  label="Download Rx"
                  fileName={pdfName("Prescription", encounter.code)}
                  build={() => prescriptionPdf(visit)}
                />
                <Button asChild variant="outline">
                  <Link href={`/opd/visits/${encounter.id}/print`}>
                    <Printer className="size-4" />
                    Print Rx
                  </Link>
                </Button>
              </>
            ) : null}
            {!open &&
            encounter.disposition === "ADMISSION_ADVISED" &&
            !visit.activeAdmissionId &&
            can("ipd.admit") ? (
              <Button onClick={() => setAdmitOpen(true)}>Admit patient</Button>
            ) : null}
          </>
        }
      />

      {visit.activeAdmissionId ? (
        <AdmittedNotice admissionId={visit.activeAdmissionId} />
      ) : null}

      {!open ? (
        <Alert
          tone="success"
          title={`Visit closed ${encounter.closedAt ? `at ${formatTime(encounter.closedAt)}` : ""}`}
        >
          Disposition: {humanize(encounter.disposition)}. The case sheet is
          filed in MRD
          {visit.medicalRecordId ? (
            <>
              {" "}
              —{" "}
              <EntityLink
                href={`/mrd?open=${visit.medicalRecordId}`}
                module="mrd"
              >
                open record
              </EntityLink>
            </>
          ) : null}
          .
        </Alert>
      ) : status === "CHECKED_IN" ? (
        <Alert tone="info" title="Waiting for the doctor">
          The patient is checked in
          {wait !== undefined
            ? ` and has waited ${formatDuration(wait)}`
            : ""}.{" "}
          {canConsult
            ? "Start the consultation to document and place orders."
            : "The doctor documents once the consultation starts."}
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Consultation"
            description="Structured OPD record. It becomes read-only once the visit is closed."
          >
            <ConsultationForm
              value={draft}
              readOnly={!editable}
              departments={departments}
              onChange={next => {
                setDraft(next);
                setDirty(true);
              }}
            />
          </Panel>

          <Panel
            title="Prescriptions"
            description="Sent to the pharmacy queue. Dispensing updates stock and the bill."
            actions={
              editable && !showRx ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRx(true)}
                >
                  <Pill className="size-4" />
                  Prescribe
                </Button>
              ) : null
            }
          >
            <div className="space-y-3">
              {showRx && editable ? (
                <PrescriptionBuilder
                  encounterId={encounter.id}
                  allergies={patient.allergies}
                  onDone={() => setShowRx(false)}
                />
              ) : null}
              {visit.prescriptions.map(rx => (
                <PrescriptionCard
                  key={rx.id}
                  rx={rx}
                  cancellable={
                    can("opd.consult") ||
                    can("ipd.order") ||
                    can("ipd.discharge")
                  }
                />
              ))}
              {!visit.prescriptions.length && !showRx ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  No medicines prescribed on this visit.
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel
            title="Investigations"
            description="Orders appear in Lab Services; verified results flow back here and into the patient record."
            actions={
              editable && !showLab ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLab(true)}
                >
                  <Flask className="size-4" />
                  Order tests
                </Button>
              ) : null
            }
          >
            <div className="space-y-3">
              {showLab && editable ? (
                <LabOrderForm
                  encounterId={encounter.id}
                  onDone={() => setShowLab(false)}
                />
              ) : null}
              {visit.labOrders.map(order => (
                <LabOrderCard key={order.id} order={order} />
              ))}
              {!visit.labOrders.length && !showLab ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  No investigations ordered on this visit.
                </p>
              ) : null}
            </div>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
          <Panel title="Vitals">
            <VitalsGrid vitals={encounter.vitals} age={patient.age} />
          </Panel>

          <Panel title="Visit">
            <div className="grid grid-cols-2 gap-x-4">
              <DetailRow
                label="Appointment"
                value={
                  appointment ? (
                    <RefCode className="text-foreground">
                      {appointment.code}
                    </RefCode>
                  ) : (
                    "—"
                  )
                }
              />
              <DetailRow label="Type" value={humanize(appointment?.type)} />
              <DetailRow
                label="Slot"
                value={appointment ? formatTime(appointment.scheduledAt) : "—"}
              />
              <DetailRow
                label="Checked in"
                value={
                  appointment?.checkedInAt
                    ? formatTime(appointment.checkedInAt)
                    : "—"
                }
              />
              <DetailRow
                label="Waited"
                value={wait !== undefined ? formatDuration(wait) : "—"}
              />
              <DetailRow
                label="Booked via"
                value={humanize(appointment?.source)}
              />
              {visit.enquiryCode ? (
                <DetailRow
                  label="From enquiry"
                  value={
                    <RefCode className="text-foreground">
                      {visit.enquiryCode}
                    </RefCode>
                  }
                />
              ) : null}
            </div>
          </Panel>

          <Panel
            title="Billing"
            description="Consultation, lab and pharmacy charges raised by this visit."
          >
            {visit.bills.length ? (
              <ul className="divide-y divide-border">
                {visit.bills.map(bill => (
                  <li
                    key={bill.id}
                    className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <EntityLink
                        href={`/billing/${bill.id}`}
                        module="billing"
                        className="font-mono text-xs"
                      >
                        {bill.code}
                      </EntityLink>
                      <p className="text-xs text-muted-foreground">
                        {formatINR(bill.total)}
                        {bill.balance > 0
                          ? ` · ${formatINR(bill.balance)} due`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={bill.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No charges yet.</p>
            )}
          </Panel>

          <Panel title="Previous encounters">
            {visit.history.length ? (
              <ul className="space-y-2.5">
                {visit.history.map(h => (
                  <li key={h.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <EntityLink
                        href={
                          h.type === "OPD"
                            ? `/opd/visits/${h.id}`
                            : `/patients/${patient.id}`
                        }
                        className="text-[0.8125rem]"
                      >
                        {h.diagnoses[0] ?? "Visit"}
                      </EntityLink>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateShort(h.date)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {h.type} · {h.doctor}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                First recorded visit.
              </p>
            )}
          </Panel>
        </aside>
      </div>

      <VitalsDialog
        open={vitalsOpen}
        onOpenChange={setVitalsOpen}
        encounterId={encounter.id}
        patientName={`${patient.firstName} ${patient.lastName} · ${patient.uhid}`}
        current={encounter.vitals}
      />
      <CloseVisitDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        encounterId={encounter.id}
        draft={draft}
        onClosed={disposition => {
          setDirty(false);
          if (disposition === "ADMISSION_ADVISED" && can("ipd.admit"))
            setAdmitOpen(true);
        }}
      />
      <AdmitDialog
        open={admitOpen}
        onOpenChange={setAdmitOpen}
        prefill={{
          patient: {
            id: patient.id,
            uhid: patient.uhid,
            name: `${patient.firstName} ${patient.lastName}`,
            phone: patient.phone,
            gender: patient.gender,
            age: patient.age,
          },
          doctorId: visit.doctor.id,
          source: "OPD",
          sourceEncounterId: encounter.id,
          reason: draft.chiefComplaint,
          diagnosis: draft.diagnoses[0]?.description ?? "",
        }}
      />
    </PageShell>
  );
}

const DISPOSITIONS: Array<{
  value: OpdDisposition;
  label: string;
  hint: string;
}> = [
  {
    value: "SENT_HOME",
    label: "Sent home",
    hint: "Treatment complete for this visit.",
  },
  {
    value: "FOLLOW_UP",
    label: "Follow-up",
    hint: "Needs the follow-up date set in the note.",
  },
  {
    value: "REFERRED",
    label: "Referred",
    hint: "Needs a referral department and note.",
  },
  {
    value: "ADMISSION_ADVISED",
    label: "Admission advised",
    hint: "Opens the admission form next.",
  },
];

function CloseVisitDialog({
  open,
  onOpenChange,
  encounterId,
  draft,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  draft: ConsultationInput;
  onClosed: (disposition: OpdDisposition) => void;
}) {
  const [disposition, setDisposition] =
    React.useState<OpdDisposition>("SENT_HOME");
  React.useEffect(() => {
    if (!open) return;
    setDisposition(
      draft.referral?.note
        ? "REFERRED"
        : draft.followUpDate
          ? "FOLLOW_UP"
          : "SENT_HOME"
    );
  }, [open, draft]);

  // Notes and closure commit together, or not at all.
  const close = useAction(
    "opd.closeVisit",
    (value: OpdDisposition) => ({
      encounterId,
      consultation: draft,
      disposition: value,
    }),
    {
      success: "Visit closed and case sheet filed to MRD",
      onSuccess: (_, value) => {
        onOpenChange(false);
        onClosed(value);
      },
    }
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Close visit"
      description="Saves the note, completes the appointment and files the OPD case sheet with Medical Records."
      size="md"
      submitLabel="Close visit"
      isSubmitting={close.isPending}
      onSubmit={event => {
        event.preventDefault();
        close.mutate(disposition);
      }}
    >
      <Field label="Disposition">
        <SelectField
          value={disposition}
          onChange={e => setDisposition(e.target.value as OpdDisposition)}
        >
          {DISPOSITIONS.map(d => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </SelectField>
      </Field>
      <p className="text-xs text-muted-foreground">
        {DISPOSITIONS.find(d => d.value === disposition)?.hint}
      </p>
      {!draft.diagnoses.filter(d => d.description.trim()).length ? (
        <Alert tone="warning" title="No diagnosis yet">
          Add at least one diagnosis in the consultation note first.
        </Alert>
      ) : null}
    </FormDialog>
  );
}
