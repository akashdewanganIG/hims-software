"use client";

import * as React from "react";
import Link from "next/link";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Printer,
} from "@/components/icons";
import { DetailRow, Field } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PrescriptionBuilder } from "@/features/opd/prescription-builder";
import { useAction } from "@/lib/api/client";
import type { DischargeSummaryInput } from "@/lib/domain/ipd";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { isoDate } from "@/lib/sim/time";

import type { AdmissionDetail } from "./api";

const EMPTY: DischargeSummaryInput = {
  finalDiagnosis: "",
  courseInHospital: "",
  proceduresDone: "",
  conditionAtDischarge: "",
  dischargeMedications: "",
  followUpInstructions: "",
  followUpDate: undefined,
};

/**
 * Discharge workflow, as enterprise HIMS run it: discharge initiated →
 * summary (draft → final) and take-home medication → the billing desk's
 * financial clearance → final discharge, which releases the bed and issues
 * the final bill.
 */
export function DischargePanel({ detail }: { detail: AdmissionDetail }) {
  const { can } = useSession();
  const { admission, summary } = detail;
  const [form, setForm] = React.useState<DischargeSummaryInput>(EMPTY);
  const [showMeds, setShowMeds] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const canEdit =
    can("ipd.discharge") &&
    admission.status === "DISCHARGE_PENDING" &&
    summary?.status === "DRAFT";

  // Reseed from the saved summary only when it is saved again (or another
  // admission opens), so background refetches never wipe what is typed.
  const savedKey = summary ? `${summary.id}:${summary.updatedAt}` : "";
  React.useEffect(() => {
    if (summary) setForm({ ...EMPTY, ...summary });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the saved version
  }, [savedKey]);

  const save = useAction(
    "ipd.saveDischargeSummary",
    (finalise: boolean) => ({
      admissionId: admission.id,
      summary: {
        finalDiagnosis: form.finalDiagnosis,
        courseInHospital: form.courseInHospital,
        proceduresDone: form.proceduresDone,
        conditionAtDischarge: form.conditionAtDischarge,
        dischargeMedications: form.dischargeMedications,
        followUpInstructions: form.followUpInstructions,
        followUpDate: form.followUpDate || undefined,
      },
      finalise,
    }),
    {
      success: (_, finalise) =>
        finalise ? "Discharge summary finalised" : "Draft saved",
    }
  );
  const discharge = useAction(
    "ipd.discharge",
    () => ({ admissionId: admission.id }),
    {
      success:
        "Patient discharged — bed released for cleaning and final bill issued",
    }
  );
  const revert = useAction(
    "ipd.revertDischarge",
    () => ({ admissionId: admission.id }),
    { success: "Discharge reverted; admission is active again" }
  );

  if (
    admission.status !== "DISCHARGE_PENDING" &&
    admission.status !== "DISCHARGED"
  ) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Discharge has not been initiated. The consultant starts it from the
        action bar.
      </p>
    );
  }

  const set = <K extends keyof DischargeSummaryInput>(
    key: K,
    value: DischargeSummaryInput[K]
  ) => setForm(current => ({ ...current, [key]: value }));
  const dischargeRx = detail.prescriptions.filter(p => p.isDischargeMedication);
  const pendingLabs = detail.labOrders.filter(
    o => o.status !== "VERIFIED" && o.status !== "CANCELLED"
  );
  const undispensed = detail.prescriptions.filter(
    p =>
      !p.isDischargeMedication &&
      (p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED")
  );

  if (admission.status === "DISCHARGED" && summary) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Discharged {formatDateTime(admission.dischargedAt)} · summary by{" "}
            {summary.preparedBy}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/ipd/${admission.id}/summary`}>
              <Printer className="size-4" />
              Print summary
            </Link>
          </Button>
        </div>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <DetailRow label="Final diagnosis" value={summary.finalDiagnosis} />
          <DetailRow
            label="Procedures"
            value={summary.proceduresDone || "Nil"}
          />
          <DetailRow
            label="Condition at discharge"
            value={summary.conditionAtDischarge}
          />
          <DetailRow
            label="Follow-up"
            value={
              summary.followUpDate
                ? formatDate(summary.followUpDate)
                : "As advised"
            }
          />
        </div>
        <DetailRow
          label="Course in hospital"
          value={
            <span className="whitespace-pre-line font-normal">
              {summary.courseInHospital}
            </span>
          }
        />
        <DetailRow
          label="Discharge medication"
          value={
            <span className="whitespace-pre-line font-normal">
              {summary.dischargeMedications || "—"}
            </span>
          }
        />
        <DetailRow
          label="Instructions"
          value={
            <span className="whitespace-pre-line font-normal">
              {summary.followUpInstructions}
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ClearanceChecklist
        detail={detail}
        pendingLabs={pendingLabs.length}
        undispensed={undispensed.length}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Final diagnosis" required>
          <Input
            readOnly={!canEdit}
            value={form.finalDiagnosis}
            onChange={e => set("finalDiagnosis", e.target.value)}
          />
        </Field>
        <Field label="Procedures done">
          <Input
            readOnly={!canEdit}
            value={form.proceduresDone}
            onChange={e => set("proceduresDone", e.target.value)}
            placeholder="Nil"
          />
        </Field>
        <Field label="Course in hospital" required className="lg:col-span-2">
          <Textarea
            readOnly={!canEdit}
            className="min-h-24"
            value={form.courseInHospital}
            onChange={e => set("courseInHospital", e.target.value)}
          />
        </Field>
        <Field label="Condition at discharge" required>
          <Input
            readOnly={!canEdit}
            value={form.conditionAtDischarge}
            onChange={e => set("conditionAtDischarge", e.target.value)}
            placeholder="e.g. Stable, afebrile, ambulant"
          />
        </Field>
        <Field label="Follow-up date">
          <Input
            type="date"
            readOnly={!canEdit}
            min={isoDate(new Date())}
            value={form.followUpDate ?? ""}
            onChange={e => set("followUpDate", e.target.value || undefined)}
          />
        </Field>
        <Field label="Discharge medication (as printed)">
          <Textarea
            readOnly={!canEdit}
            className="min-h-20"
            value={form.dischargeMedications}
            onChange={e => set("dischargeMedications", e.target.value)}
          />
        </Field>
        <Field label="Follow-up instructions" required>
          <Textarea
            readOnly={!canEdit}
            className="min-h-20"
            value={form.followUpInstructions}
            onChange={e => set("followUpInstructions", e.target.value)}
          />
        </Field>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            onClick={() => revert.mutate()}
            disabled={revert.isPending}
          >
            Revert to active
          </Button>
          <Button
            variant="outline"
            onClick={() => save.mutate(false)}
            disabled={save.isPending}
          >
            Save draft
          </Button>
          <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
            Finalise summary
          </Button>
        </div>
      ) : null}

      <section className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Discharge medication</h3>
          {can("ipd.discharge") && !showMeds && !dischargeRx.length ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowMeds(true)}
            >
              Prescribe take-home medicines
            </Button>
          ) : null}
        </div>
        {showMeds ? (
          <PrescriptionBuilder
            encounterId={detail.encounterId}
            allergies={detail.patient.allergies}
            dischargeMedication
            submitLabel="Send discharge medication"
            onDone={() => setShowMeds(false)}
          />
        ) : dischargeRx.length ? (
          <p className="text-xs text-muted-foreground">
            {dischargeRx
              .map(
                r => `${r.code} (${r.status.replace(/_/g, " ").toLowerCase()})`
              )
              .join(", ")}{" "}
            — see the Orders tab.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No take-home prescription yet.
          </p>
        )}
      </section>

      {summary?.status === "FINAL" &&
      detail.clearance.billingCleared &&
      can("ipd.discharge") ? (
        <div className="flex flex-col gap-2 rounded-lg border border-success-border bg-success-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-success-foreground">
            Summary is final and billing has cleared the discharge. Discharging
            releases the bed for cleaning, posts the last room charges and
            issues the final bill.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              onClick={() => revert.mutate()}
              disabled={revert.isPending}
            >
              Revert
            </Button>
            <Button variant="raised" onClick={() => setConfirm(true)}>
              Discharge patient
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Discharge the patient?"
        description={`${detail.patient.firstName} ${detail.patient.lastName} leaves bed ${detail.row.bed?.code ?? ""}. The bed moves to cleaning and the running bill becomes the final bill.`}
        confirmText="Discharge"
        onConfirm={async () => {
          await discharge.mutateAsync();
        }}
      />
    </div>
  );
}

/** The discharge clearances, each with who acts on it. */
function ClearanceChecklist({
  detail,
  pendingLabs,
  undispensed,
}: {
  detail: AdmissionDetail;
  pendingLabs: number;
  undispensed: number;
}) {
  const { can } = useSession();
  const { admission, clearance } = detail;
  const [open, setOpen] = React.useState(false);
  const bill = detail.bills.find(b => b.status === "DRAFT");
  const steps: Array<{
    label: string;
    state: "done" | "pending" | "warning";
    detail: React.ReactNode;
    action?: React.ReactNode;
  }> = [
    {
      label: "Discharge initiated",
      state: "done",
      detail: `By the consultant · ${formatDateTime(admission.dischargeInitiatedAt)}`,
    },
    {
      label: "Discharge summary",
      state: clearance.summaryFinal ? "done" : "pending",
      detail: clearance.summaryFinal
        ? "Finalised by the doctor."
        : "The doctor completes and finalises it below.",
    },
    {
      label: "Billing clearance",
      state: clearance.billingCleared ? "done" : "pending",
      detail: clearance.billingCleared ? (
        <>
          Cleared by {clearance.clearedBy} ·{" "}
          {formatDateTime(admission.billingClearedAt)}
          {admission.clearanceNote
            ? ` · approved with dues: ${admission.clearanceNote}`
            : " · no dues"}
        </>
      ) : clearance.balance > 0 ? (
        <>
          Final bill balance{" "}
          <span className="font-semibold text-foreground">
            {formatINR(clearance.balance)}
          </span>{" "}
          (includes today&apos;s room and nursing). The billing desk collects
          it, then clears.
        </>
      ) : (
        "The bill is settled; the billing desk can clear the discharge."
      ),
      action:
        !clearance.billingCleared && can("billing.collect") ? (
          <div className="flex flex-wrap gap-2">
            {bill && clearance.balance > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/billing/${bill.id}`}>Collect payment</Link>
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setOpen(true)}>
              Clear billing
            </Button>
          </div>
        ) : undefined,
    },
    {
      label: "Lab",
      state: pendingLabs ? "warning" : "done",
      detail: pendingLabs
        ? `${pendingLabs} order(s) not yet verified — reports follow the patient.`
        : "No pending lab orders.",
    },
    {
      label: "Pharmacy",
      state: undispensed ? "warning" : "done",
      detail: undispensed
        ? `${undispensed} inpatient order(s) stop at discharge; return unused ward stock.`
        : "No open inpatient medication orders.",
    },
  ];
  return (
    <section
      aria-label="Discharge clearance"
      className="rounded-xl border border-border bg-surface-subtle p-3"
    >
      <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Discharge clearance
      </h3>
      <ol className="mt-2 space-y-1.5">
        {steps.map(step => {
          const Icon =
            step.state === "done"
              ? CheckCircle2
              : step.state === "warning"
                ? AlertTriangle
                : Circle;
          return (
            <li
              key={step.label}
              className="flex flex-col gap-2 rounded-lg bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    step.state === "done"
                      ? "text-success-foreground"
                      : step.state === "warning"
                        ? "text-warning-foreground"
                        : "text-muted-foreground"
                  )}
                />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-medium text-foreground">
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
              </div>
              {step.action ? (
                <div className="shrink-0 pl-6 sm:pl-0">{step.action}</div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <ClearBillingDialog
        open={open}
        onOpenChange={setOpen}
        admissionId={admission.id}
        balance={clearance.balance}
      />
    </section>
  );
}

function ClearBillingDialog({
  open,
  onOpenChange,
  admissionId,
  balance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: string;
  balance: number;
}) {
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) setNote("");
  }, [open]);
  const clear = useAction(
    "ipd.clearBilling",
    () => ({ admissionId, note: balance > 0 ? note : undefined }),
    {
      success:
        balance > 0
          ? "Billing cleared with approved dues"
          : "Billing cleared — no dues",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clear billing for discharge"
      description={
        balance > 0
          ? `${formatINR(balance)} is still due. Clear only if the patient may leave with dues — insurance or corporate credit, or management approval — and record who approved it.`
          : "The final bill is settled. Clearing lets the ward discharge the patient."
      }
      size="md"
      submitLabel={balance > 0 ? "Clear with dues" : "Clear billing"}
      isSubmitting={clear.isPending}
      submitDisabled={balance > 0 && note.trim().length < 5}
      onSubmit={event => {
        event.preventDefault();
        clear.mutate();
      }}
    >
      {balance > 0 ? (
        <Field label="Approved by / reason" required>
          <Textarea
            value={note}
            maxLength={300}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Cashless claim approved by the insurer; balance on TPA settlement"
          />
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          No balance is due on the final bill.
        </p>
      )}
    </FormDialog>
  );
}
