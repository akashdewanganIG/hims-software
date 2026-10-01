"use client";

import * as React from "react";

import {
  AlertTriangle,
  Camera,
  Droplet,
  HospitalIcon,
  Phone,
} from "@/components/icons";
import { EntityLink } from "@/components/shared/entity";
import { PersonPhoto } from "@/components/shared/files";
import { Field, PriorityBadge, StatusBadge } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import type { LabOrderView, PrescriptionView } from "@/features/opd/api";
import { useAction } from "@/lib/api/client";
import {
  formatDateTime,
  formatGender,
  formatPhone,
  formatTime,
  humanize,
} from "@/lib/format";
import type { ResultFlag, Vitals } from "@/lib/sim/schema";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Patient banner                                                      */
/* ------------------------------------------------------------------ */

export function PatientBanner({
  patient,
  badges,
  meta,
  actions,
  recordHref,
  onPhotoClick,
}: {
  patient: {
    firstName: string;
    lastName: string;
    uhid: string;
    age: number;
    gender: string;
    bloodGroup?: string;
    phone: string;
    allergies: string[];
    chronicConditions: string[];
    photoFileId?: string;
  };
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Links the name to the patient's EHR record (hidden for roles without EHR). */
  recordHref?: string;
  /** Makes the photo a button that manages it (logins that edit patients). */
  onPhotoClick?: () => void;
}) {
  const name = `${patient.firstName} ${patient.lastName}`;
  const photo = (
    <PersonPhoto
      fileId={patient.photoFileId}
      name={name}
      className="size-14 rounded-xl text-base"
    />
  );
  return (
    <section
      aria-label="Patient"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm shadow-foreground/[0.02] lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        {onPhotoClick ? (
          <button
            type="button"
            onClick={onPhotoClick}
            aria-label={patient.photoFileId ? "Change photo" : "Add photo"}
            className="group relative shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {photo}
            <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-110">
              <Camera className="size-3" />
            </span>
          </button>
        ) : (
          photo
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="truncate text-base font-semibold leading-6 tracking-tight text-foreground sm:text-lg">
              {recordHref ? (
                <EntityLink
                  href={recordHref}
                  module="ehr"
                  className="text-foreground hover:text-primary"
                >
                  {name}
                </EntityLink>
              ) : (
                name
              )}
            </h1>
            {badges}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{patient.uhid}</span>
            <span>
              {patient.age} y · {formatGender(patient.gender)}
            </span>
            {patient.bloodGroup ? (
              <span className="inline-flex items-center gap-1">
                <Droplet className="size-3.5" />
                {patient.bloodGroup}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3.5" />
              {formatPhone(patient.phone)}
            </span>
            {meta}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {patient.allergies.length ? (
              patient.allergies.map(a => (
                <Tag key={a} tone="danger" className="gap-1">
                  <AlertTriangle />
                  {`Allergy: ${a}`}
                </Tag>
              ))
            ) : (
              <Tag tone="neutral">No known allergies</Tag>
            )}
            {patient.chronicConditions.map(c => (
              <Tag key={c} tone="neutral">
                {c}
              </Tag>
            ))}
          </div>
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Vitals                                                              */
/* ------------------------------------------------------------------ */

const VITAL_ROWS: Array<{
  label: string;
  value: (v: Vitals) => string | undefined;
  abnormal: (v: Vitals, age?: number) => boolean;
}> = [
  {
    label: "Temperature",
    value: v => (v.temperatureC ? `${v.temperatureC} °C` : undefined),
    abnormal: v =>
      (v.temperatureC ?? 37) >= 38 || (v.temperatureC ?? 37) < 35.5,
  },
  {
    label: "Pulse",
    value: v => (v.pulse ? `${v.pulse}/min` : undefined),
    abnormal: (v, age) =>
      (v.pulse ?? 80) > (age !== undefined && age < 12 ? 140 : 110) ||
      (v.pulse ?? 80) < 50,
  },
  {
    label: "Blood pressure",
    value: v =>
      v.systolic ? `${v.systolic}/${v.diastolic ?? "—"} mmHg` : undefined,
    abnormal: v =>
      (v.systolic ?? 120) >= 140 ||
      (v.diastolic ?? 80) >= 90 ||
      (v.systolic ?? 120) < 90,
  },
  {
    label: "SpO₂",
    value: v => (v.spo2 ? `${v.spo2}%` : undefined),
    abnormal: v => (v.spo2 ?? 99) < 94,
  },
  {
    label: "Resp. rate",
    value: v => (v.respiratoryRate ? `${v.respiratoryRate}/min` : undefined),
    abnormal: (v, age) =>
      (v.respiratoryRate ?? 16) > (age !== undefined && age < 12 ? 36 : 24),
  },
  {
    label: "Weight / height",
    value: v =>
      v.weightKg
        ? `${v.weightKg} kg${v.heightCm ? ` · ${v.heightCm} cm` : ""}`
        : undefined,
    abnormal: () => false,
  },
];

export function VitalsGrid({ vitals, age }: { vitals?: Vitals; age?: number }) {
  if (!vitals)
    return (
      <p className="py-3 text-center text-sm text-muted-foreground">
        Vitals not recorded yet.
      </p>
    );
  return (
    <div>
      <dl className="grid grid-cols-2 gap-2">
        {VITAL_ROWS.map(row => {
          const value = row.value(vitals);
          const abnormal = value !== undefined && row.abnormal(vitals, age);
          return (
            <div
              key={row.label}
              className={cn(
                "rounded-lg border px-2.5 py-2",
                abnormal
                  ? "border-error-border bg-error-surface"
                  : "border-border bg-surface-subtle"
              )}
            >
              <dt className="text-[0.6875rem] text-muted-foreground">
                {row.label}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 text-[0.8125rem] font-semibold tabular-nums",
                  abnormal ? "text-error-foreground" : "text-foreground"
                )}
              >
                {value ?? "—"}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Recorded {formatTime(vitals.recordedAt)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lab orders & results                                                */
/* ------------------------------------------------------------------ */

const FLAG_TEXT: Record<ResultFlag, string> = {
  NORMAL: "",
  LOW: "L",
  HIGH: "H",
  CRITICAL_LOW: "LL",
  CRITICAL_HIGH: "HH",
  ABNORMAL: "A",
};

export function FlagMark({ flag }: { flag: ResultFlag }) {
  if (flag === "NORMAL") return null;
  const critical = flag.startsWith("CRITICAL");
  return (
    <span
      title={humanize(flag)}
      className={cn(
        "ml-1.5 inline-flex h-4 min-w-5 items-center justify-center rounded px-1 text-[0.625rem] font-bold",
        critical
          ? "bg-error text-destructive-foreground"
          : "bg-error-surface text-error-foreground"
      )}
    >
      {FLAG_TEXT[flag]}
    </span>
  );
}

export function LabOrderCard({ order }: { order: LabOrderView }) {
  const reported =
    order.status === "VERIFIED" || order.status === "RESULT_READY";
  return (
    <article className="rounded-lg border border-border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {order.code}
          </span>
          <span className="text-[0.8125rem] font-medium">
            {order.tests.map(t => t.name).join(", ")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {order.priority !== "ROUTINE" ? (
            <PriorityBadge priority={order.priority} />
          ) : null}
          <StatusBadge
            status={order.status}
            label={order.status === "RESULT_READY" ? "Preliminary" : undefined}
          />
        </div>
      </header>
      {reported ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-[0.8125rem]">
            <thead>
              <tr className="text-left text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Parameter</th>
                <th className="px-3 py-1.5 text-right font-semibold">Result</th>
                <th className="px-3 py-1.5 font-semibold">Unit</th>
                <th className="px-3 py-1.5 font-semibold">Reference</th>
              </tr>
            </thead>
            <tbody>
              {order.tests.flatMap(test =>
                test.results.map(r => (
                  <tr
                    key={`${test.itemId}-${r.parameter}`}
                    className="border-t border-border-subtle"
                  >
                    <td className="px-3 py-1.5">
                      {order.tests.length > 1 ? (
                        <span className="text-muted-foreground">
                          {test.code} ·{" "}
                        </span>
                      ) : null}
                      {r.parameter}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-semibold tabular-nums",
                        r.flag !== "NORMAL" && "text-error-foreground"
                      )}
                    >
                      {r.value}
                      <FlagMark flag={r.flag} />
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {r.unit}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                      {r.reference}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Ordered {formatDateTime(order.orderedAt)} by {order.orderedBy}
          {order.sampleId ? ` · sample ${order.sampleId}` : ""}
        </p>
      )}
      {reported ? (
        <footer className="border-t border-border-subtle px-3 py-1.5 text-[0.6875rem] text-muted-foreground">
          {order.status === "VERIFIED"
            ? `Verified ${formatDateTime(order.verifiedAt)}`
            : "Awaiting verification — preliminary values"}
        </footer>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Prescriptions                                                       */
/* ------------------------------------------------------------------ */

export function PrescriptionCard({
  rx,
  cancellable = false,
}: {
  rx: PrescriptionView;
  /** The viewer prescribes: a prescription nothing was dispensed from can be withdrawn. */
  cancellable?: boolean;
}) {
  return (
    <article className="rounded-lg border border-border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {rx.code}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(rx.createdAt)} · {rx.prescriber}
          </span>
          {rx.isDischargeMedication ? (
            <Tag tone="progress">Discharge medication</Tag>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={rx.status} />
          {cancellable && rx.status === "PENDING" ? (
            <CancelPrescription rx={rx} />
          ) : null}
        </div>
      </header>
      <ul className="divide-y divide-border-subtle">
        {rx.items.map(item => (
          <li
            key={item.id}
            className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[0.8125rem] font-medium",
                  item.status === "CANCELLED" &&
                    "text-muted-foreground line-through"
                )}
              >
                {item.medicine}{" "}
                <span className="font-normal text-muted-foreground">
                  {item.strength}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {item.dose} · {item.frequency} · {humanize(item.route)} ·{" "}
                {item.durationDays} d
                {item.instructions ? ` · ${item.instructions}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-right">
              <span
                className={cn(
                  "font-semibold",
                  item.quantityDispensed >= item.quantityPrescribed
                    ? "text-success-foreground"
                    : "text-foreground"
                )}
              >
                {item.quantityDispensed}/{item.quantityPrescribed}
              </span>{" "}
              {item.unit}s dispensed
              {item.quantityReturned
                ? ` · ${item.quantityReturned} returned`
                : ""}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Shown on OPD and record screens when the patient has a live admission. */
export function AdmittedNotice({
  admissionId,
  label = "This patient is currently admitted.",
}: {
  admissionId: string;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-info-border bg-info-surface px-3.5 py-2.5 text-[0.8125rem] text-info-foreground">
      <HospitalIcon className="size-4 shrink-0" />
      <span>{label}</span>
      <EntityLink href={`/ipd/${admissionId}`} module="ipd">
        Open admission
      </EntityLink>
    </div>
  );
}

/** The prescriber withdraws a prescription the pharmacy has not started. */
function CancelPrescription({ rx }: { rx: PrescriptionView }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const cancel = useAction(
    "rx.cancel",
    () => ({ prescriptionId: rx.id, reason }),
    {
      success: `${rx.code} cancelled`,
      onSuccess: () => setOpen(false),
    }
  );
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-error-foreground"
        onClick={() => {
          setReason("");
          setOpen(true);
        }}
      >
        Cancel
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cancel ${rx.code}`}
        description="Withdraws the whole prescription before anything is dispensed; the pharmacy queue drops it at once."
        size="sm"
        submitLabel="Cancel prescription"
        cancelLabel="Keep"
        isSubmitting={cancel.isPending}
        submitDisabled={!reason.trim()}
        onSubmit={event => {
          event.preventDefault();
          cancel.mutate();
        }}
      >
        <Field label="Reason" required>
          <Input
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Changed to a syrup"
          />
        </Field>
      </FormDialog>
    </>
  );
}
