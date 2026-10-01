"use client";

import * as React from "react";

import { Field } from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { useAction } from "@/lib/api/client";
import { formatINR, humanize } from "@/lib/format";
import {
  CHARGE_CATEGORIES,
  PAYMENT_METHODS,
  type ChargeCategory,
  type ID,
  type PaymentMethod,
} from "@/lib/sim/schema";

export function PaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  balance,
  deposit = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: ID;
  balance: number;
  /** Advance deposit on an admission's running bill: no upper limit. */
  deposit?: boolean;
}) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("UPI");
  const [reference, setReference] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setAmount(deposit ? String(Math.max(balance, 5000)) : String(balance));
    setMethod("UPI");
    setReference("");
  }, [open, balance, deposit]);
  const pay = useAction(
    "billing.collect",
    () => ({ invoiceId, amount: Number(amount), method, reference }),
    {
      success: p => `${formatINR(p.amount)} received · receipt ${p.code}`,
      onSuccess: () => onOpenChange(false),
    }
  );
  const value = Number(amount);
  const tooMuch = !deposit && value > balance + 0.005;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={deposit ? "Collect deposit" : "Collect payment"}
      description={
        deposit
          ? `Advance against the running bill (charges so far ${formatINR(balance)} due). Any excess is refunded at discharge.`
          : `Outstanding ${formatINR(balance)}. Part payments are allowed.`
      }
      size="sm"
      submitLabel={value > 0 ? `Collect ${formatINR(value)}` : "Collect"}
      isSubmitting={pay.isPending}
      submitDisabled={!(value > 0) || tooMuch}
      onSubmit={event => {
        event.preventDefault();
        pay.mutate();
      }}
    >
      <Field
        label="Amount (₹)"
        required
        error={tooMuch ? "More than the outstanding balance" : undefined}
      >
        <Input
          type="number"
          min={1}
          step="0.01"
          autoFocus
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label="Reference" hint="UPI / card transaction ID">
          <Input
            value={reference}
            onChange={e => setReference(e.target.value)}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

export function RefundDialog({
  open,
  onOpenChange,
  invoiceId,
  max,
  suggested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: ID;
  max: number;
  suggested: number;
}) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setAmount(String(suggested || ""));
    setMethod("CASH");
    setReason(suggested ? "Refund of excess collected" : "");
  }, [open, suggested]);
  const refund = useAction(
    "billing.refund",
    () => ({ invoiceId, amount: Number(amount), method, reason }),
    {
      success: p => `${formatINR(p.amount)} refunded · ${p.code}`,
      onSuccess: () => onOpenChange(false),
    }
  );
  const value = Number(amount);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Issue refund"
      description={`Up to ${formatINR(max)} collected on this bill can be refunded.`}
      size="sm"
      submitLabel="Issue refund"
      isSubmitting={refund.isPending}
      submitDisabled={!(value > 0) || value > max + 0.005 || !reason.trim()}
      onSubmit={event => {
        event.preventDefault();
        refund.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" required>
          <Input
            type="number"
            min={1}
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Mode">
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
      </div>
      <Field label="Reason" required>
        <Input value={reason} onChange={e => setReason(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export function ChargeDialog({
  open,
  onOpenChange,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: ID;
}) {
  const [form, setForm] = React.useState({
    category: "PROCEDURE" as ChargeCategory,
    description: "",
    quantity: "1",
    unitPrice: "",
  });
  React.useEffect(() => {
    if (open)
      setForm({
        category: "PROCEDURE",
        description: "",
        quantity: "1",
        unitPrice: "",
      });
  }, [open]);
  const add = useAction(
    "billing.addCharge",
    () => ({
      invoiceId,
      category: form.category as Exclude<ChargeCategory, "REGISTRATION">,
      description: form.description,
      quantity: Number(form.quantity),
      unitPrice: Number(form.unitPrice),
    }),
    { success: "Charge added", onSuccess: () => onOpenChange(false) }
  );
  const set = (key: keyof typeof form, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add charge"
      description="For services not raised automatically, such as a procedure or dressing. Lab, pharmacy, room and consultation charges post on their own."
      size="md"
      submitLabel="Add charge"
      isSubmitting={add.isPending}
      submitDisabled={
        !form.description.trim() ||
        !(Number(form.quantity) > 0) ||
        !Number.isInteger(Number(form.quantity)) ||
        !(Number(form.unitPrice) >= 0) ||
        form.unitPrice === ""
      }
      onSubmit={event => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <Field label="Category">
          <SelectField
            value={form.category}
            onChange={e => set("category", e.target.value)}
          >
            {CHARGE_CATEGORIES.filter(c => c !== "REGISTRATION").map(c => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Description" required>
          <Input
            autoFocus
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="e.g. Wound dressing"
          />
        </Field>
        <Field label="Quantity">
          <Input
            type="number"
            min={1}
            step={1}
            value={form.quantity}
            onChange={e => set("quantity", e.target.value)}
          />
        </Field>
        <Field label="Unit price (₹)" required>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.unitPrice}
            onChange={e => set("unitPrice", e.target.value)}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

export function DiscountDialog({
  item,
  onClose,
}: {
  item: { id: ID; description: string; gross: number; discount: number } | null;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    if (item) setValue(String(item.discount || ""));
  }, [item]);
  const save = useAction(
    "billing.setDiscount",
    () => ({ itemId: item!.id, discount: Number(value) || 0 }),
    { success: "Discount applied", onSuccess: onClose }
  );
  const amount = Number(value) || 0;
  return (
    <FormDialog
      open={Boolean(item)}
      onOpenChange={open => !open && onClose()}
      title="Line discount"
      description={
        item
          ? `${item.description} · line amount ${formatINR(item.gross)}`
          : undefined
      }
      size="sm"
      submitLabel="Apply"
      isSubmitting={save.isPending}
      submitDisabled={amount < 0 || (item ? amount > item.gross : true)}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field
        label="Discount (₹)"
        hint={
          item && amount > 0
            ? `${((amount / item.gross) * 100).toFixed(1)}% of the line`
            : "Enter 0 to remove"
        }
      >
        <Input
          type="number"
          min={0}
          step="0.01"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

export function CancelInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: ID;
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const cancel = useAction("billing.cancel", () => ({ invoiceId, reason }), {
    success: "Bill cancelled",
    onSuccess: () => onOpenChange(false),
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel bill"
      description="Only bills with nothing collected (or fully refunded) can be cancelled."
      size="sm"
      submitLabel="Cancel bill"
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
        />
      </Field>
    </FormDialog>
  );
}
