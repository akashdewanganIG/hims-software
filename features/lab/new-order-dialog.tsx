"use client";

import * as React from "react";
import Link from "next/link";

import { HospitalIcon, Stethoscope } from "@/components/icons";
import { PatientPicker } from "@/components/shared/patient-picker";
import { Field } from "@/components/shared/page";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { PatientOption } from "@/features/opd/api";
import { LabOrderForm } from "@/features/opd/lab-order-form";
import { formatDateShort } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { LabOrder } from "@/lib/sim/schema";
import { cn } from "@/lib/utils";

import { useLabOrderTargets, type LabOrderTarget } from "./api";

/**
 * Book tests from the lab desk: the patient, then the admission or OPD visit
 * the order belongs to — its charges post to that bill, and the report files
 * with that stay or visit in the patient's record.
 */
export function NewLabOrderDialog({
  open,
  onOpenChange,
  onOrdered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrdered?: (order: LabOrder) => void;
}) {
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [encounterId, setEncounterId] = React.useState("");
  const { data: targets, isLoading } = useLabOrderTargets(patient?.id ?? null);

  React.useEffect(() => {
    if (!open) {
      setPatient(null);
      setEncounterId("");
    }
  }, [open]);

  // Default to the patient's admission, else their latest open visit.
  React.useEffect(() => {
    if (!targets?.length) return setEncounterId("");
    setEncounterId(current =>
      targets.some(t => t.encounterId === current)
        ? current
        : targets[0]!.encounterId
    );
  }, [targets]);

  const target = targets?.find(t => t.encounterId === encounterId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New lab order</DialogTitle>
          <DialogDescription>
            Choose the patient and the admission or OPD visit the tests belong
            to. Charges go to that bill, and the report appears with it in the
            patient&apos;s record.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Patient" required>
            <PatientPicker
              value={patient}
              onChange={setPatient}
              autoFocus={open && !patient}
            />
          </Field>

          {patient ? (
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1.5 text-[0.8125rem] font-medium text-foreground">
                Order for
              </legend>
              {isLoading ? (
                <Skeleton className="h-14 w-full rounded-lg" />
              ) : targets?.length ? (
                <div
                  role="radiogroup"
                  aria-label="Order for"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {targets.map(t => (
                    <TargetOption
                      key={t.encounterId}
                      target={t}
                      checked={t.encounterId === encounterId}
                      onSelect={() => setEncounterId(t.encounterId)}
                    />
                  ))}
                </div>
              ) : (
                <NoOpenEncounter name={patient.name} />
              )}
            </fieldset>
          ) : null}

          {target ? (
            <div className="border-t border-border pt-4">
              <LabOrderForm
                key={target.encounterId}
                encounterId={target.encounterId}
                billedTo={
                  target.type === "IPD"
                    ? `admission ${target.code}`
                    : `OPD visit ${target.code}`
                }
                onDone={order => {
                  onOpenChange(false);
                  onOrdered?.(order);
                }}
              />
            </div>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function TargetOption({
  target,
  checked,
  onSelect,
}: {
  target: LabOrderTarget;
  checked: boolean;
  onSelect: () => void;
}) {
  const Icon = target.type === "IPD" ? HospitalIcon : Stethoscope;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
        checked
          ? "border-primary bg-primary-surface"
          : "border-border bg-surface hover:border-border-strong"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          checked ? "text-primary" : "text-muted-foreground"
        )}
      />
      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-medium text-foreground">
          {target.type === "IPD" ? "Admission" : "OPD visit"}{" "}
          <span className="font-mono">{target.code}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {target.where} · {target.doctor} · since{" "}
          {formatDateShort(target.since)}
        </span>
      </span>
    </button>
  );
}

function NoOpenEncounter({ name }: { name: string }) {
  const { canAccess } = useSession();
  return (
    <div className="rounded-lg border border-warning-border bg-warning-surface px-3 py-2.5 text-[0.8125rem] text-warning-foreground">
      <p className="font-medium">
        {name} has no active admission or open OPD visit.
      </p>
      <p className="mt-0.5 text-xs leading-5">
        Every order belongs to a visit or a stay, so its charges and report land
        in the right place.
        {canAccess("opd") ? (
          <>
            {" "}
            Register a walk-in from the{" "}
            <Link href="/opd" className="font-medium underline">
              OPD queue
            </Link>{" "}
            first, then order the tests here.
          </>
        ) : (
          " Ask the front desk to open an OPD visit first."
        )}
      </p>
    </div>
  );
}
