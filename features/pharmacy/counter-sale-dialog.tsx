"use client";

import * as React from "react";
import Link from "next/link";

import { Plus, Trash2 } from "@/components/icons";
import { PatientPicker } from "@/components/shared/patient-picker";
import { Field, SelectField } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { useMedicineOptions, type PatientOption } from "@/features/opd/api";
import { useAction } from "@/lib/api/client";
import { formatINR, humanize } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/sim/schema";
import { toast } from "@/lib/toast";

interface Line {
  key: number;
  medicineId: string;
  quantity: string;
}

let nextKey = 1;
const blankLine = (): Line => ({
  key: nextKey++,
  medicineId: "",
  quantity: "1",
});

/**
 * Over-the-counter sale at the pharmacy counter: a registered patient,
 * non-prescription medicines only, its own bill — paid now or left for the
 * billing desk. Schedule H medicines are listed but cannot be chosen.
 */
export function CounterSaleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: medicines = [] } = useMedicineOptions();
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [lines, setLines] = React.useState<Line[]>([blankLine()]);
  const [payNow, setPayNow] = React.useState(true);
  const [method, setMethod] = React.useState<PaymentMethod>("UPI");
  const [reference, setReference] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setPatient(null);
    setLines([blankLine()]);
    setPayNow(true);
    setMethod("UPI");
    setReference("");
  }, [open]);

  const byId = new Map(medicines.map(m => [m.id, m]));
  const sorted = [...medicines].sort(
    (a, b) =>
      Number(a.prescriptionOnly) - Number(b.prescriptionOnly) ||
      a.name.localeCompare(b.name)
  );
  const chosen = lines.filter(l => l.medicineId && Number(l.quantity) > 0);
  const total = chosen.reduce(
    (sum, l) =>
      sum + (byId.get(l.medicineId)?.unitPrice ?? 0) * Number(l.quantity),
    0
  );
  const shortage = chosen.find(
    l => Number(l.quantity) > (byId.get(l.medicineId)?.stock ?? 0)
  );
  const duplicate =
    new Set(chosen.map(l => l.medicineId)).size !== chosen.length;

  const sell = useAction(
    "pharmacy.counterSale",
    () => ({
      patientId: patient!.id,
      lines: chosen.map(l => ({
        medicineId: l.medicineId,
        quantity: Number(l.quantity),
      })),
      payment: payNow
        ? { method, reference: reference.trim() || undefined }
        : undefined,
    }),
    {
      onSuccess: sale => {
        onOpenChange(false);
        toast.success(
          `Counter sale ${sale.code} · ${formatINR(sale.total)}${payNow ? " paid" : " sent to billing"}`,
          {
            action: {
              label: "Print bill",
              onClick: () =>
                window.open(`/billing/${sale.invoiceId}/print`, "_blank"),
            },
          }
        );
      },
    }
  );

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines(current =>
      current.map(l => (l.key === key ? { ...l, ...patch } : l))
    );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Counter sale"
      description="Over-the-counter medicines for a registered patient, on a pharmacy bill of their own. Prescription-only (Schedule H) medicines need a doctor's prescription and are dispensed from the queue."
      size="lg"
      submitLabel={payNow ? `Sell · ${formatINR(total)}` : "Sell on account"}
      isSubmitting={sell.isPending}
      submitDisabled={
        !patient || !chosen.length || Boolean(shortage) || duplicate
      }
      onSubmit={event => {
        event.preventDefault();
        sell.mutate();
      }}
      bodyClassName="gap-4"
    >
      <Field label="Patient" required>
        <PatientPicker value={patient} onChange={setPatient} />
      </Field>

      <div className="space-y-2">
        <p className="text-[0.8125rem] font-medium text-foreground">
          Medicines
        </p>
        {lines.map(line => {
          const m = byId.get(line.medicineId);
          return (
            <div
              key={line.key}
              className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-start gap-2"
            >
              <div className="min-w-0">
                <SelectField
                  aria-label="Medicine"
                  value={line.medicineId}
                  onChange={e =>
                    setLine(line.key, { medicineId: e.target.value })
                  }
                >
                  <option value="">Choose a medicine…</option>
                  {sorted.map(opt => (
                    <option
                      key={opt.id}
                      value={opt.id}
                      disabled={opt.prescriptionOnly || opt.stock === 0}
                    >
                      {`${opt.name} ${opt.strength} · ${formatINR(opt.unitPrice)}/${opt.unit}${opt.prescriptionOnly ? " · Rx only" : opt.stock === 0 ? " · out of stock" : ` · ${opt.stock} in stock`}`}
                    </option>
                  ))}
                </SelectField>
                {m && Number(line.quantity) > m.stock ? (
                  <p className="mt-1 text-xs text-error-foreground">
                    Only {m.stock} {m.unit}(s) in stock.
                  </p>
                ) : null}
              </div>
              <Input
                aria-label="Quantity"
                type="number"
                min={1}
                value={line.quantity}
                onChange={e => setLine(line.key, { quantity: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove line"
                disabled={lines.length === 1}
                onClick={() =>
                  setLines(current => current.filter(l => l.key !== line.key))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
        {duplicate ? (
          <p className="text-xs text-error-foreground">
            List each medicine once.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines(current => [...current, blankLine()])}
        >
          <Plus className="size-4" />
          Add medicine
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface-subtle p-3">
        <label className="flex items-center gap-2 text-[0.8125rem] font-medium">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={payNow}
            onChange={e => setPayNow(e.target.checked)}
          />
          Collect payment now ({formatINR(total)})
        </label>
        {payNow ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Method">
              <SelectField
                value={method}
                onChange={e => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>
                    {humanize(m)}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Reference">
              <Input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="UPI / card reference"
              />
            </Field>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            The bill stays open; the billing desk collects it from{" "}
            <Link href="/billing" className="text-primary underline">
              Billing
            </Link>
            .
          </p>
        )}
      </div>
    </FormDialog>
  );
}
