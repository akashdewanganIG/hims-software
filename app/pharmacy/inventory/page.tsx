"use client";

import * as React from "react";

import { Edit, Plus, Trash2 } from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RefCode } from "@/components/shared/entity";
import {
  DetailGrid,
  DetailRow,
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { useInventory, type InventoryRow } from "@/features/pharmacy/api";
import { matches } from "@/lib/api/lookup";
import { useAction } from "@/lib/api/client";
import {
  formatDate,
  formatINR,
  formatINRCompact,
  formatNumber,
  humanize,
} from "@/lib/format";
import { SUPPLIERS } from "@/lib/sim/reference";
import { MEDICINE_FORMS, type MedicineForm } from "@/lib/sim/schema";
import { useSession } from "@/lib/session";
import { addDaysIso, isoDate } from "@/lib/sim/time";

type Filter = "all" | "low" | "expiry";

export default function InventoryPage() {
  const { can } = useSession();
  const { data: rows = [], isLoading, error } = useInventory();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [receiveFor, setReceiveFor] = React.useState<string | null>(null);
  /** null: closed; "new": adding; otherwise the medicine being edited. */
  const [editing, setEditing] = React.useState<InventoryRow | "new" | null>(
    null
  );

  const categories = [...new Set(rows.map(r => r.category))].sort();
  const visible = rows.filter(
    r =>
      (filter === "all" ||
        (filter === "low"
          ? r.status !== "OK"
          : r.nearExpiryQty > 0 || r.expiredQty > 0)) &&
      (!category || r.category === category) &&
      matches(q, r.name, r.genericName, r.code, r.category)
  );
  const selected = rows.find(r => r.id === openId) ?? null;
  const value = rows.reduce((s, r) => s + r.stockValue, 0);
  const low = rows.filter(r => r.status !== "OK").length;
  const expiry = rows.filter(
    r => r.nearExpiryQty > 0 || r.expiredQty > 0
  ).length;

  const columns: Column<InventoryRow>[] = [
    {
      id: "name",
      header: "Medicine",
      sortValue: r => r.name,
      cell: r => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {r.name}{" "}
            <span className="font-normal text-muted-foreground">
              {r.strength}
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {r.genericName} · {humanize(r.form)}
            {r.prescriptionOnly ? (
              <span className="ml-1.5 rounded border border-border px-1 text-[0.625rem] font-semibold uppercase tracking-wide text-text-secondary">
                Rx only
              </span>
            ) : null}
          </p>
        </div>
      ),
    },
    {
      id: "code",
      header: "Code",
      defaultHidden: true,
      cell: r => <RefCode>{r.code}</RefCode>,
    },
    {
      id: "category",
      header: "Category",
      sortValue: r => r.category,
      cell: r => <span className="text-muted-foreground">{r.category}</span>,
    },
    {
      id: "stock",
      header: "On hand",
      align: "right",
      sortValue: r => r.stock,
      cell: r => (
        <span
          className={
            r.status !== "OK"
              ? "font-semibold text-error-foreground"
              : "font-medium"
          }
        >
          {formatNumber(r.stock)}
        </span>
      ),
    },
    {
      id: "reorder",
      header: "Reorder at",
      align: "right",
      sortValue: r => r.reorderLevel,
      cell: r => formatNumber(r.reorderLevel),
    },
    {
      id: "used",
      header: "Used 30 d",
      align: "right",
      sortValue: r => r.dispensed30,
      cell: r => formatNumber(r.dispensed30),
    },
    {
      id: "expiry",
      header: "Next expiry",
      sortValue: r => r.nextExpiry,
      cell: r =>
        r.nextExpiry ? (
          <span className={r.nearExpiryQty ? "text-warning-foreground" : ""}>
            {formatDate(r.nextExpiry)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "price",
      header: "MRP / unit",
      align: "right",
      sortValue: r => r.unitPrice,
      cell: r => formatINR(r.unitPrice),
    },
    {
      id: "value",
      header: "Stock value",
      align: "right",
      defaultHidden: true,
      sortValue: r => r.stockValue,
      cell: r => formatINR(r.stockValue, true),
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => (
        <div className="flex flex-wrap gap-1">
          {r.status === "OUT" ? (
            <Tag tone="danger">Out of stock</Tag>
          ) : r.status === "LOW" ? (
            <Tag tone="danger">Low stock</Tag>
          ) : (
            <Tag tone="active">In stock</Tag>
          )}
          {r.expiredQty ? (
            <Tag tone="danger">Expired batch</Tag>
          ) : r.nearExpiryQty ? (
            <Tag tone="pending">Expiring</Tag>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Pharmacy inventory"
        subtitle="Medicine catalogue with batch-wise stock. Usable stock excludes expired batches."
        breadcrumb={[
          { label: "Pharmacy", href: "/pharmacy" },
          { label: "Inventory" },
        ]}
        actions={
          can("pharmacy.stock") ? (
            <>
              <Button variant="outline" onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                Add medicine
              </Button>
              <Button onClick={() => setReceiveFor("")}>
                <Plus className="size-4" />
                Receive stock
              </Button>
            </>
          ) : null
        }
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Medicines"
          value={rows.length}
          loading={isLoading}
          hint={`${categories.length} categories`}
        />
        <StatCard
          label="Stock value (cost)"
          value={formatINRCompact(value)}
          loading={isLoading}
        />
        <StatCard
          label="Low or out"
          value={low}
          loading={isLoading}
          tone={low ? "critical" : "positive"}
          hint="At or below reorder level"
        />
        <StatCard
          label="Expiry watch"
          value={expiry}
          loading={isLoading}
          tone={expiry ? "warning" : "neutral"}
          hint="Expired or due in 60 days"
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={visible}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "name", direction: "asc" }}
          onRowClick={r => setOpenId(r.id)}
          pageSize={15}
          toolbar={
            <>
              <CategorySwitcher
                label="Stock filter"
                value={filter}
                onValueChange={setFilter}
                items={[
                  { value: "all", label: "All", count: rows.length },
                  { value: "low", label: "Low stock", count: low },
                  { value: "expiry", label: "Expiry watch", count: expiry },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Name, generic or code"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-56"
                aria-label="Category"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            </>
          }
        />
      </Panel>
      <MedicineSheet
        medicine={selected}
        onClose={() => setOpenId(null)}
        onReceive={id => setReceiveFor(id)}
        onEdit={row => setEditing(row)}
      />
      <MedicineDialog
        medicine={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={id => setOpenId(id)}
      />
      <ReceiveDialog
        medicineId={receiveFor}
        medicines={rows}
        onClose={() => setReceiveFor(null)}
      />
    </PageShell>
  );
}

function MedicineSheet({
  medicine,
  onClose,
  onReceive,
  onEdit,
}: {
  medicine: InventoryRow | null;
  onClose: () => void;
  onReceive: (id: string) => void;
  onEdit: (row: InventoryRow) => void;
}) {
  const { can } = useSession();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const remove = useAction(
    "pharmacy.deleteMedicine",
    () => ({ medicineId: medicine!.id }),
    {
      success: m => `${m.name} ${m.strength} removed from the formulary`,
      onSuccess: () => {
        setConfirmDelete(false);
        onClose();
      },
    }
  );
  const writeOff = useAction(
    "pharmacy.writeOff",
    (batchId: string) => ({ batchId, reason: "Expired — removed from shelf" }),
    { success: "Expired batch written off" }
  );
  return (
    <Sheet open={Boolean(medicine)} onOpenChange={open => !open && onClose()}>
      <SheetContent size="lg">
        {medicine ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>
                  {medicine.name} {medicine.strength}
                </SheetTitle>
                <RefCode>{medicine.code}</RefCode>
                {medicine.prescriptionOnly ? (
                  <Tag tone="pending">Prescription only</Tag>
                ) : null}
              </div>
              <SheetDescription>
                {medicine.genericName} · {medicine.category} ·{" "}
                {medicine.manufacturer}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4">
              <DetailGrid columns={3}>
                <DetailRow
                  label="Usable stock"
                  value={`${formatNumber(medicine.stock)} ${medicine.unit}s`}
                />
                <DetailRow
                  label="Reorder level"
                  value={formatNumber(medicine.reorderLevel)}
                />
                <DetailRow
                  label="Used in 30 days"
                  value={formatNumber(medicine.dispensed30)}
                />
                <DetailRow
                  label="MRP per unit"
                  value={formatINR(medicine.unitPrice)}
                />
                <DetailRow label="Form" value={humanize(medicine.form)} />
                <DetailRow
                  label="Stock value"
                  value={formatINR(medicine.stockValue, true)}
                />
              </DetailGrid>
              <div>
                <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Batches (first expiry first out)
                </p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="h-9 px-3">Batch</th>
                        <th className="px-3">Expiry</th>
                        <th className="px-3 text-right">Qty</th>
                        <th className="px-3 text-right">Cost</th>
                        <th className="px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {medicine.batches.map(b => (
                        <tr
                          key={b.id}
                          className="border-b border-border/80 last:border-0"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {b.batchNumber}
                          </td>
                          <td className="px-3 py-2">
                            {formatDate(b.expiryDate)}{" "}
                            {b.expired ? (
                              <Tag tone="danger" className="ml-1">
                                Expired
                              </Tag>
                            ) : b.nearExpiry ? (
                              <Tag tone="pending" className="ml-1">
                                Soon
                              </Tag>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatNumber(b.quantityOnHand)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatINR(b.costPrice)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {b.expired &&
                            b.quantityOnHand > 0 &&
                            can("pharmacy.stock") ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => writeOff.mutate(b.id)}
                              >
                                Write off
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </SheetBody>
            {can("pharmacy.stock") ? (
              <SheetFooter>
                {medicine.deletable ? (
                  <Button
                    variant="outline"
                    className="text-error-foreground"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => onEdit(medicine)}>
                  <Edit className="size-4" />
                  Edit
                </Button>
                <Button onClick={() => onReceive(medicine.id)}>
                  <Plus className="size-4" />
                  Receive stock
                </Button>
              </SheetFooter>
            ) : null}
            <ConfirmationDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Remove from the formulary?"
              description={`${medicine.name} ${medicine.strength} has never been stocked, prescribed or sold, so it can be removed entirely.`}
              confirmText="Remove medicine"
              variant="destructive"
              isLoading={remove.isPending}
              onConfirm={async () => {
                await remove.mutateAsync();
              }}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ReceiveDialog({
  medicineId,
  medicines,
  onClose,
}: {
  medicineId: string | null;
  medicines: InventoryRow[];
  onClose: () => void;
}) {
  const [form, setForm] = React.useState({
    medicineId: "",
    supplier: "",
    invoiceNumber: "",
    batchNumber: "",
    expiryDate: "",
    quantity: "",
    costPrice: "",
  });
  React.useEffect(() => {
    if (medicineId === null) return;
    const m = medicines.find(x => x.id === medicineId);
    // Keep the supplier invoice across receipts: one invoice has many lines.
    setForm(current => ({
      medicineId: medicineId,
      supplier: current.supplier,
      invoiceNumber: current.invoiceNumber,
      batchNumber: "",
      expiryDate: addDaysIso(isoDate(new Date()), 365),
      quantity: "",
      costPrice: m ? String(Math.round(m.unitPrice * 0.62 * 100) / 100) : "",
    }));
  }, [medicineId, medicines]);
  const save = useAction(
    "pharmacy.receiveStock",
    () => ({
      medicineId: form.medicineId,
      supplier: form.supplier,
      invoiceNumber: form.invoiceNumber,
      batchNumber: form.batchNumber,
      expiryDate: form.expiryDate,
      quantity: Number(form.quantity),
      costPrice: Number(form.costPrice),
    }),
    { success: "Stock received and added to inventory", onSuccess: onClose }
  );
  const set = (key: keyof typeof form, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  return (
    <FormDialog
      open={medicineId !== null}
      onOpenChange={open => !open && onClose()}
      title="Receive stock (GRN)"
      description="A goods receipt against the supplier's invoice: adds a batch (or tops up an existing one) and records the receipt in the pharmacy ledger."
      size="md"
      submitLabel="Receive"
      isSubmitting={save.isPending}
      submitDisabled={
        !form.medicineId ||
        !form.supplier.trim() ||
        !form.invoiceNumber.trim() ||
        !form.batchNumber.trim() ||
        !(Number(form.quantity) > 0)
      }
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Medicine" required>
        <SelectField
          value={form.medicineId}
          onChange={e => set("medicineId", e.target.value)}
        >
          <option value="">Choose a medicine…</option>
          {[...medicines]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(m => (
              <option key={m.id} value={m.id}>
                {`${m.name} ${m.strength} (${m.stock} on hand)`}
              </option>
            ))}
        </SelectField>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier" required>
          <Input
            value={form.supplier}
            list="grn-suppliers"
            onChange={e => set("supplier", e.target.value)}
            placeholder="Distributor name"
          />
        </Field>
        <datalist id="grn-suppliers">
          {SUPPLIERS.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Field label="Supplier invoice no." required>
          <Input
            value={form.invoiceNumber}
            onChange={e => set("invoiceNumber", e.target.value.toUpperCase())}
            className="font-mono"
            placeholder="e.g. SI/2609/04123"
          />
        </Field>
        <Field label="Batch number" required>
          <Input
            value={form.batchNumber}
            onChange={e => set("batchNumber", e.target.value.toUpperCase())}
            className="font-mono"
          />
        </Field>
        <Field label="Expiry date" required>
          <Input
            type="date"
            min={addDaysIso(isoDate(new Date()), 1)}
            value={form.expiryDate}
            onChange={e => set("expiryDate", e.target.value)}
          />
        </Field>
        <Field label="Quantity (units)" required>
          <Input
            type="number"
            min={1}
            value={form.quantity}
            onChange={e => set("quantity", e.target.value)}
          />
        </Field>
        <Field label="Cost per unit (₹)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.costPrice}
            onChange={e => set("costPrice", e.target.value)}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

const blankMedicine = {
  name: "",
  genericName: "",
  form: "TABLET" as MedicineForm,
  strength: "",
  unit: "tablet",
  category: "",
  unitPrice: "",
  reorderLevel: "100",
  manufacturer: "",
  prescriptionOnly: true,
};

/** Adds a medicine to the formulary, or edits one. */
function MedicineDialog({
  medicine,
  categories,
  onClose,
  onSaved,
}: {
  medicine: InventoryRow | "new" | null;
  categories: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const editing = medicine && medicine !== "new" ? medicine : null;
  const [form, setForm] = React.useState(blankMedicine);
  React.useEffect(() => {
    if (!medicine) return;
    setForm(
      editing
        ? {
            name: editing.name,
            genericName: editing.genericName,
            form: editing.form,
            strength: editing.strength,
            unit: editing.unit,
            category: editing.category,
            unitPrice: String(editing.unitPrice),
            reorderLevel: String(editing.reorderLevel),
            manufacturer: editing.manufacturer,
            prescriptionOnly: editing.prescriptionOnly,
          }
        : blankMedicine
    );
  }, [medicine, editing]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(current => ({ ...current, [key]: value }));
  const input = () => ({
    ...form,
    unitPrice: Number(form.unitPrice),
    reorderLevel: Number(form.reorderLevel),
  });
  const done = (m: { id: string }) => {
    onClose();
    onSaved(m.id);
  };
  const create = useAction("pharmacy.createMedicine", input, {
    onSuccess: done,
    success: m => `${m.name} ${m.strength} added as ${m.code}`,
  });
  const update = useAction(
    "pharmacy.updateMedicine",
    () => ({ medicineId: editing!.id, medicine: input() }),
    { onSuccess: done, success: m => `${m.name} ${m.strength} updated` }
  );
  const save = editing ? update : create;
  const price = Number(form.unitPrice);
  const reorder = Number(form.reorderLevel);
  const invalid =
    !form.name.trim() ||
    !form.genericName.trim() ||
    !form.strength.trim() ||
    !form.unit.trim() ||
    !form.category.trim() ||
    !form.manufacturer.trim() ||
    form.unitPrice === "" ||
    !(price >= 0) ||
    !Number.isInteger(reorder) ||
    reorder < 0;
  const categoryList = React.useId();

  return (
    <FormDialog
      open={Boolean(medicine)}
      onOpenChange={open => !open && onClose()}
      title={
        editing ? `Edit ${editing.name} ${editing.strength}` : "Add medicine"
      }
      description={
        editing
          ? `${editing.code} · a new price applies to what is dispensed from now on.`
          : "Adds an item to the formulary. Receive stock against it before it can be dispensed."
      }
      size="lg"
      submitLabel={editing ? "Save changes" : "Add medicine"}
      isSubmitting={save.isPending}
      submitDisabled={invalid}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand name" required>
          <Input
            value={form.name}
            onChange={e => set("name", e.target.value)}
          />
        </Field>
        <Field label="Generic name" required>
          <Input
            value={form.genericName}
            onChange={e => set("genericName", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Form">
          <SelectField
            value={form.form}
            onChange={e => set("form", e.target.value as MedicineForm)}
          >
            {MEDICINE_FORMS.map(f => (
              <option key={f} value={f}>
                {humanize(f)}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Strength" required>
          <Input
            value={form.strength}
            onChange={e => set("strength", e.target.value)}
            placeholder="e.g. 500 mg"
          />
        </Field>
        <Field label="Dispensing unit" required>
          <Input
            value={form.unit}
            onChange={e => set("unit", e.target.value)}
            placeholder="tablet, bottle, vial"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" required>
          <Input
            value={form.category}
            list={categoryList}
            onChange={e => set("category", e.target.value)}
          />
        </Field>
        <Field label="Manufacturer" required>
          <Input
            value={form.manufacturer}
            onChange={e => set("manufacturer", e.target.value)}
          />
        </Field>
        <datalist id={categoryList}>
          {categories.map(c => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="MRP per unit (₹)" required>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.unitPrice}
            onChange={e => set("unitPrice", e.target.value)}
          />
        </Field>
        <Field label="Reorder level" hint="Low-stock alert at or below this">
          <Input
            type="number"
            min={0}
            step={1}
            value={form.reorderLevel}
            onChange={e => set("reorderLevel", e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-[0.8125rem]">
        <Checkbox
          checked={form.prescriptionOnly}
          onCheckedChange={checked => set("prescriptionOnly", checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">
            Prescription only (Schedule H / H1 / X)
          </span>
          <span className="block text-xs text-muted-foreground">
            Never sold over the counter — dispensed only against a prescription.
          </span>
        </span>
      </label>
    </FormDialog>
  );
}
