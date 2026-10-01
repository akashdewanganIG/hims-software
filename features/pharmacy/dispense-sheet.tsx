"use client";

import * as React from "react";

import { AlertTriangle, RotateCcw } from "@/components/icons";
import { AllergyFlag, EntityLink } from "@/components/shared/entity";
import { Field, StatusBadge } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
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
import { useAction } from "@/lib/api/client";
import { formatDate, formatDateTime, formatINR, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { useDispenseDetail } from "./api";

export function DispenseSheet({
  prescriptionId,
  onClose,
}: {
  prescriptionId: string | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const { data, isLoading } = useDispenseDetail(prescriptionId);
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [returning, setReturning] = React.useState<{
    itemId: string;
    name: string;
    max: number;
  } | null>(null);
  const [closing, setClosing] = React.useState(false);

  // Default quantities follow what remains to dispense; a refetch that
  // changes nothing for this prescription keeps the pharmacist's edits.
  const remainingKey = data
    ? `${data.rx.id}:${data.items.map(i => `${i.id}=${i.remaining}`).join(",")}`
    : "";
  React.useEffect(() => {
    if (!data) return;
    setQty(
      Object.fromEntries(
        data.items.map(i => [i.id, String(Math.min(i.remaining, i.stock))])
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed only when remaining quantities change
  }, [remainingKey]);

  const give = useAction(
    "pharmacy.dispense",
    (lines: Array<{ itemId: string; quantity: number }>) => ({
      prescriptionId: prescriptionId!,
      lines,
    }),
    {
      success: txns =>
        `Dispensed from ${txns.length} batch draw${txns.length === 1 ? "" : "s"} — stock and bill updated`,
    }
  );

  const canDispense =
    can("pharmacy.dispense") &&
    (data?.rx.status === "PENDING" ||
      data?.rx.status === "PARTIALLY_DISPENSED");
  const lines = data
    ? data.items
        .map(i => ({ itemId: i.id, quantity: Number(qty[i.id]) || 0 }))
        .filter(l => l.quantity > 0)
    : [];
  const total = data
    ? lines.reduce(
        (s, l) =>
          s +
          l.quantity *
            (data.items.find(i => i.id === l.itemId)?.unitPrice ?? 0),
        0
      )
    : 0;

  return (
    <>
      <Sheet
        open={Boolean(prescriptionId)}
        onOpenChange={open => !open && onClose()}
      >
        <SheetContent size="xl">
          {isLoading || !data ? (
            <SheetBody className="space-y-3">
              <SheetTitle className="sr-only">Loading prescription</SheetTitle>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-40 w-full" />
            </SheetBody>
          ) : (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>Prescription {data.rx.code}</SheetTitle>
                  <StatusBadge status={data.rx.status} />
                </div>
                <SheetDescription>
                  {data.setting} · {data.location} · {data.rx.prescriber} ·{" "}
                  {formatDateTime(data.rx.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-[0.8125rem] font-medium">
                      <EntityLink
                        href={`/patients/${data.patient.id}`}
                        module="ehr"
                        className="text-foreground"
                      >
                        {data.patient.name}
                      </EntityLink>
                      <AllergyFlag allergies={data.patient.allergies} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{data.patient.uhid}</span> ·{" "}
                      {data.patient.age} y
                      {data.patient.allergies.length
                        ? ` · allergic to ${data.patient.allergies.join(", ")}`
                        : ""}
                    </p>
                  </div>
                </div>
                {data.notes ? (
                  <Alert tone="info">Prescriber note: {data.notes}</Alert>
                ) : null}

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="h-9 px-3">Medicine</th>
                        <th className="px-3 text-right">Given</th>
                        <th className="px-3 text-right">Stock</th>
                        <th className="px-3">Next batch (FEFO)</th>
                        <th className="px-3 text-right">Dispense now</th>
                        <th className="px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.rx.items.map(item => {
                        const extra = data.items.find(i => i.id === item.id)!;
                        const short = extra.remaining > extra.stock;
                        const batch = extra.batches[0];
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-border/80 align-top last:border-0"
                          >
                            <td className="px-3 py-2.5">
                              <p
                                className={cn(
                                  "font-medium",
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
                                {item.dose} · {item.frequency} ·{" "}
                                {humanize(item.route)} · {item.durationDays} d
                                {item.instructions
                                  ? ` · ${item.instructions}`
                                  : ""}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {item.quantityDispensed}/{item.quantityPrescribed}
                              {item.quantityReturned ? (
                                <span className="block text-xs text-muted-foreground">
                                  {item.quantityReturned} returned
                                </span>
                              ) : null}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2.5 text-right tabular-nums",
                                short && "font-semibold text-error-foreground"
                              )}
                            >
                              {extra.stock}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {batch ? (
                                <>
                                  <span className="font-mono text-foreground">
                                    {batch.batchNumber}
                                  </span>
                                  <br />
                                  exp {formatDate(batch.expiryDate)} ·{" "}
                                  {batch.quantity} left
                                </>
                              ) : (
                                <span className="text-error-foreground">
                                  No usable stock
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {extra.remaining > 0 && canDispense ? (
                                <Input
                                  type="number"
                                  min={0}
                                  max={Math.min(extra.remaining, extra.stock)}
                                  className="ml-auto w-24 text-right"
                                  value={qty[item.id] ?? ""}
                                  onChange={e =>
                                    setQty(current => ({
                                      ...current,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  aria-label={`Quantity of ${item.medicine} to dispense`}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {item.status === "CANCELLED"
                                    ? "Stopped"
                                    : extra.remaining
                                      ? "—"
                                      : "Complete"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {extra.returnable > 0 &&
                              can("pharmacy.dispense") ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setReturning({
                                      itemId: item.id,
                                      name: `${item.medicine} ${item.strength}`,
                                      max: extra.returnable,
                                    })
                                  }
                                >
                                  <RotateCcw className="size-4" />
                                  Return
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {data.items.some(i => i.remaining > i.stock) && canDispense ? (
                  <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
                    <AlertTriangle className="size-3.5" />
                    Stock is short for some lines. Dispense what is available;
                    the balance stays on the queue.
                  </p>
                ) : null}
              </SheetBody>
              <SheetFooter className="sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {canDispense
                    ? lines.length
                      ? `${formatINR(total)} will be billed to the patient's ${data.setting === "IPD" ? "running bill" : "visit bill"}`
                      : "Enter quantities to dispense"
                    : "Nothing left to dispense."}
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  {canDispense ? (
                    <Button variant="outline" onClick={() => setClosing(true)}>
                      Close as not collected
                    </Button>
                  ) : null}
                  {canDispense ? (
                    <Button
                      disabled={!lines.length || give.isPending}
                      onClick={() => give.mutate(lines)}
                    >
                      {give.isPending ? "Dispensing…" : "Dispense"}
                    </Button>
                  ) : null}
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <ReturnDialog target={returning} onClose={() => setReturning(null)} />
      <CloseDialog
        open={closing}
        onOpenChange={setClosing}
        prescriptionId={prescriptionId}
      />
    </>
  );
}

function ReturnDialog({
  target,
  onClose,
}: {
  target: { itemId: string; name: string; max: number } | null;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = React.useState("1");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (target) {
      setQuantity("1");
      setReason("");
    }
  }, [target]);
  const save = useAction(
    "pharmacy.return",
    () => ({
      itemId: target!.itemId,
      quantity: Math.round(Number(quantity)),
      reason,
    }),
    {
      success: "Return recorded — stock restored and the bill credited",
      onSuccess: onClose,
    }
  );
  return (
    <FormDialog
      open={Boolean(target)}
      onOpenChange={open => !open && onClose()}
      title="Return medicine"
      description={
        target
          ? `${target.name} · up to ${target.max} unit(s) can be returned. Stock goes back to its original batch and the bill is credited.`
          : undefined
      }
      size="sm"
      submitLabel="Record return"
      isSubmitting={save.isPending}
      submitDisabled={!reason.trim() || !(Number(quantity) > 0)}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Quantity">
          <Input
            type="number"
            min={1}
            max={target?.max}
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Reason" required>
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Unopened, dose changed"
          />
        </Field>
      </div>
    </FormDialog>
  );
}

function CloseDialog({
  open,
  onOpenChange,
  prescriptionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptionId: string | null;
}) {
  const [reason, setReason] = React.useState(
    "Not collected — patient purchased outside"
  );
  const save = useAction(
    "pharmacy.closeUncollected",
    () => ({ prescriptionId: prescriptionId!, reason }),
    {
      success: "Prescription closed",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Close prescription"
      description="Stops everything still undispensed. Units already handed over stay billed."
      size="sm"
      submitLabel="Close prescription"
      isSubmitting={save.isPending}
      submitDisabled={!reason.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Reason" required>
        <Input value={reason} onChange={e => setReason(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
