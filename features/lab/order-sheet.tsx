"use client";

import * as React from "react";
import Link from "next/link";

import { Printer } from "@/components/icons";
import { AllergyFlag, EntityLink } from "@/components/shared/entity";
import { Field, PriorityBadge, StatusBadge } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { FlagMark, LabOrderCard } from "@/features/clinical/components";
import { useAction } from "@/lib/api/client";
import { flagFor } from "@/lib/domain/lab";
import { formatDateTime, formatDuration, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { LabStatus } from "@/lib/sim/schema";
import { cn } from "@/lib/utils";

import { useLabOrderDetail } from "./api";

const STEPS: LabStatus[] = [
  "ORDERED",
  "SAMPLE_PENDING",
  "COLLECTED",
  "PROCESSING",
  "RESULT_READY",
  "VERIFIED",
];
const STEP_LABEL: Record<string, string> = {
  ORDERED: "Ordered",
  SAMPLE_PENDING: "Sample due",
  COLLECTED: "Collected",
  PROCESSING: "Processing",
  RESULT_READY: "Reported",
  VERIFIED: "Verified",
};

export function LabOrderSheet({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const { data, isLoading } = useLabOrderDetail(orderId);
  const [values, setValues] = React.useState<
    Record<string, Record<string, string>>
  >({});
  const [cancelOpen, setCancelOpen] = React.useState(false);

  // Seed from saved results when an order opens; later refetches (after an
  // action, or someone else's change) keep whatever is being typed.
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!orderId) seededFor.current = null;
  }, [orderId]);
  React.useEffect(() => {
    if (!data) return;
    const saved = Object.fromEntries(
      data.entry.map(t => [
        t.itemId,
        Object.fromEntries(t.parameters.map(p => [p.id, p.value])),
      ])
    );
    if (seededFor.current !== data.order.id) {
      seededFor.current = data.order.id;
      setValues(saved);
      return;
    }
    setValues(current => {
      const next: Record<string, Record<string, string>> = { ...saved };
      for (const [itemId, params] of Object.entries(current)) {
        if (!next[itemId]) continue;
        for (const [paramId, value] of Object.entries(params))
          if (value.trim())
            next[itemId] = { ...next[itemId], [paramId]: value };
      }
      return next;
    });
  }, [data]);

  const request = useAction(
    "lab.requestSample",
    () => ({ orderId: orderId! }),
    { success: "Sample requested from the ward / collection desk" }
  );
  const collect = useAction(
    "lab.collectSample",
    () => ({ orderId: orderId! }),
    { success: o => `Sample ${o.sampleId} collected` }
  );
  const process = useAction(
    "lab.startProcessing",
    () => ({ orderId: orderId! }),
    { success: "Processing started" }
  );
  const save = useAction(
    "lab.enterResults",
    () => ({ orderId: orderId!, values }),
    { success: "Results saved — awaiting verification" }
  );
  const verify = useAction("lab.verify", () => ({ orderId: orderId! }), {
    success: "Results verified and released to the patient record",
  });

  const status = data?.order.status;
  const cancelled = status === "CANCELLED";
  const canEnter =
    can("lab.result") && (status === "PROCESSING" || status === "RESULT_READY");
  const allFilled =
    data?.entry.every(t =>
      t.parameters.every(p => (values[t.itemId]?.[p.id] ?? "").trim())
    ) ?? false;

  return (
    <>
      <Sheet open={Boolean(orderId)} onOpenChange={open => !open && onClose()}>
        <SheetContent size="xl">
          {isLoading || !data ? (
            <SheetBody className="space-y-3">
              <SheetTitle className="sr-only">Loading lab order</SheetTitle>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-48 w-full" />
            </SheetBody>
          ) : (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>Lab order {data.order.code}</SheetTitle>
                  <StatusBadge status={data.order.status} />
                  {data.order.priority !== "ROUTINE" ? (
                    <PriorityBadge priority={data.order.priority} />
                  ) : null}
                </div>
                <SheetDescription>
                  {data.setting} · ordered{" "}
                  {formatDateTime(data.order.orderedAt)} by{" "}
                  {data.view.orderedBy}
                  {data.order.sampleId
                    ? ` · sample ${data.order.sampleId}`
                    : ""}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2">
                  <p className="flex items-center gap-1 text-[0.8125rem] font-medium">
                    <EntityLink
                      href={`/patients/${data.patient.id}`}
                      module="ehr"
                      className="text-foreground"
                    >
                      {data.patient.name}
                    </EntityLink>
                    <AllergyFlag allergies={data.patient.allergies} />
                    <span className="font-normal text-muted-foreground">
                      · <span className="font-mono">{data.patient.uhid}</span> ·{" "}
                      {data.patient.age} y{" "}
                      {data.patient.gender === "MALE" ? "M" : "F"}
                    </span>
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums",
                      data.elapsedHours > data.expectedHours &&
                        !["VERIFIED", "CANCELLED"].includes(data.order.status)
                        ? "font-semibold text-error-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    TAT {formatDuration(data.elapsedHours * 60)} / target{" "}
                    {formatDuration(data.expectedHours * 60)}
                  </p>
                </div>

                {cancelled ? (
                  <Alert tone="error" title="Order cancelled">
                    {data.order.cancelReason}
                  </Alert>
                ) : (
                  <Stepper
                    className="[&_[role=progressbar]>div]:min-w-0"
                    steps={STEPS.map(s => STEP_LABEL[s]!)}
                    currentIndex={STEPS.indexOf(data.order.status)}
                  />
                )}
                {data.clinicalNotes ? (
                  <Alert tone="info">
                    Clinical notes: {data.clinicalNotes}
                  </Alert>
                ) : null}

                {canEnter ? (
                  <div className="space-y-3">
                    {data.entry.map(test => (
                      <fieldset
                        key={test.itemId}
                        className="rounded-lg border border-border"
                      >
                        <legend className="sr-only">{test.testName}</legend>
                        <div className="border-b border-border bg-surface-subtle px-3 py-2 text-[0.8125rem] font-medium">
                          {test.testName}{" "}
                          <span className="font-normal text-muted-foreground">
                            · {humanize(test.sampleType)}
                          </span>
                        </div>
                        <div className="divide-y divide-border-subtle">
                          {test.parameters.map(p => {
                            const value = values[test.itemId]?.[p.id] ?? "";
                            const flag = value.trim()
                              ? flagFor(p, value)
                              : "NORMAL";
                            return (
                              <div
                                key={p.id}
                                className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_10rem_7rem_9rem]"
                              >
                                <label
                                  htmlFor={`${test.itemId}-${p.id}`}
                                  className="text-[0.8125rem]"
                                >
                                  {p.name}
                                </label>
                                {p.options?.length ? (
                                  <SelectField
                                    id={`${test.itemId}-${p.id}`}
                                    value={value}
                                    onChange={e =>
                                      setValues(cur => ({
                                        ...cur,
                                        [test.itemId]: {
                                          ...cur[test.itemId],
                                          [p.id]: e.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">Select…</option>
                                    {p.options.map(o => (
                                      <option key={o} value={o}>
                                        {o}
                                      </option>
                                    ))}
                                  </SelectField>
                                ) : (
                                  <Input
                                    id={`${test.itemId}-${p.id}`}
                                    inputMode="decimal"
                                    className={cn(
                                      "text-right",
                                      flag !== "NORMAL" &&
                                        "border-error text-error-foreground"
                                    )}
                                    value={value}
                                    onChange={e =>
                                      setValues(cur => ({
                                        ...cur,
                                        [test.itemId]: {
                                          ...cur[test.itemId],
                                          [p.id]: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {p.unit}
                                  <FlagMark flag={flag} />
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  Ref{" "}
                                  {p.refText ??
                                    `${p.refLow ?? "—"}–${p.refHigh ?? "—"}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                ) : status === "RESULT_READY" || status === "VERIFIED" ? (
                  <LabOrderCard order={data.view} />
                ) : (
                  <ul className="text-[0.8125rem]">
                    {data.entry.map(t => (
                      <li key={t.itemId}>
                        {t.testName}{" "}
                        <span className="text-muted-foreground">
                          · {humanize(t.sampleType)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div>
                  <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Audit trail
                  </p>
                  <ol className="space-y-1 text-xs">
                    {data.timeline.map(step => (
                      <li
                        key={step.label}
                        className={cn(
                          "flex justify-between gap-3",
                          !step.at && "text-text-disabled"
                        )}
                      >
                        <span>
                          {step.label}
                          {step.by ? ` · ${step.by}` : ""}
                        </span>
                        <span className="tabular-nums">
                          {step.at ? formatDateTime(step.at) : "—"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </SheetBody>
              <SheetFooter>
                {(status === "ORDERED" || status === "SAMPLE_PENDING") &&
                (can("lab.order") ||
                  can("lab.collect") ||
                  can("lab.result")) ? (
                  <Button
                    variant="outline"
                    className="text-error-foreground"
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel order
                  </Button>
                ) : null}
                {status === "ORDERED" && can("lab.collect") ? (
                  <Button
                    variant="outline"
                    onClick={() => request.mutate()}
                    disabled={request.isPending}
                  >
                    Request sample
                  </Button>
                ) : null}
                {(status === "ORDERED" || status === "SAMPLE_PENDING") &&
                can("lab.collect") ? (
                  <Button
                    onClick={() => collect.mutate()}
                    disabled={collect.isPending}
                  >
                    Collect sample
                  </Button>
                ) : null}
                {status === "COLLECTED" && can("lab.result") ? (
                  <Button
                    onClick={() => process.mutate()}
                    disabled={process.isPending}
                  >
                    Start processing
                  </Button>
                ) : null}
                {canEnter ? (
                  <Button
                    variant={status === "RESULT_READY" ? "outline" : "default"}
                    onClick={() => save.mutate()}
                    disabled={!allFilled || save.isPending}
                  >
                    {status === "RESULT_READY"
                      ? "Correct results"
                      : "Save results"}
                  </Button>
                ) : null}
                {status === "RESULT_READY" && can("lab.verify") ? (
                  <Button
                    variant="raised"
                    onClick={() => verify.mutate()}
                    disabled={verify.isPending}
                  >
                    Verify & release
                  </Button>
                ) : null}
                {status === "VERIFIED" || status === "RESULT_READY" ? (
                  <Button asChild variant="outline">
                    <Link href={`/lab/reports/${data.order.id}`}>
                      <Printer className="size-4" />
                      {status === "VERIFIED"
                        ? "Print report"
                        : "Preview report"}
                    </Link>
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <CancelLabDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderId={orderId}
      />
    </>
  );
}

function CancelLabDialog({
  open,
  onOpenChange,
  orderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const cancel = useAction(
    "lab.cancel",
    () => ({ orderId: orderId!, reason }),
    {
      success: "Order cancelled and its charges withdrawn",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel lab order"
      description="Charges are withdrawn from the bill. If the bill is already paid, refund from Billing instead."
      size="sm"
      submitLabel="Cancel order"
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
          placeholder="e.g. Duplicate order"
        />
      </Field>
    </FormDialog>
  );
}
