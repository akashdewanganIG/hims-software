/**
 * View builders for pharmacy: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import type { Database } from "@/lib/sim/schema";
import { isBatchUsable, stockOnHand } from "@/lib/domain/pharmacy";
import {
  admissionBed,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type {
  ID,
  Medicine,
  MedicineBatch,
  PharmacyTxnType,
  Prescription,
} from "@/lib/sim/schema";
import { addDaysIso, isSameDay, isoDate, minutesBetween } from "@/lib/sim/time";
import { prescriptionView, type PrescriptionView } from "@/features/opd/views";

export interface RxQueueRow {
  id: ID;
  code: string;
  status: Prescription["status"];
  patient: PatientRef;
  prescriber: string;
  setting: "OPD" | "IPD" | "Discharge";
  location: string;
  createdAt: string;
  waitingMinutes: number;
  items: number;
  remainingItems: number;
  stockShort: boolean;
  lastDispensedAt?: string;
}
export function prescriptionQueueView(
  db: Database,
  now: Date,
  filters: {
    view: "open" | "today" | "all";
    q?: string;
  }
) {
  const today = isoDate(now);
  // One pass: last dispense time per prescription.
  const rxOfItem = new Map(
    db.prescriptionItems.map(i => [i.id, i.prescriptionId])
  );
  const lastDispense = new Map<ID, string>();
  for (const t of db.pharmacyTransactions) {
    if (t.type !== "DISPENSE" || !t.prescriptionItemId) continue;
    const rxId = rxOfItem.get(t.prescriptionItemId);
    if (rxId && (lastDispense.get(rxId) ?? "") < t.at)
      lastDispense.set(rxId, t.at);
  }
  return db.prescriptions
    .filter(rx => {
      if (
        filters.view === "open" &&
        rx.status !== "PENDING" &&
        rx.status !== "PARTIALLY_DISPENSED"
      )
        return false;
      const lastTxn = lastDispense.get(rx.id);
      if (filters.view === "today" && !(lastTxn && isSameDay(lastTxn, now)))
        return false;
      if (filters.q) {
        const p = db.patients.find(x => x.id === rx.patientId);
        if (
          !matches(
            filters.q,
            rx.code,
            p && `${p.firstName} ${p.lastName}`,
            p?.uhid,
            p?.phone
          )
        )
          return false;
      }
      return true;
    })
    .map<RxQueueRow>(rx => {
      const items = db.prescriptionItems.filter(
        i => i.prescriptionId === rx.id
      );
      const open = items.filter(
        i => i.status === "PENDING" || i.status === "PARTIAL"
      );
      const admission = rx.admissionId
        ? db.admissions.find(a => a.id === rx.admissionId)
        : undefined;
      const bed = admission ? admissionBed(db, admission) : undefined;
      const dispensedAt = lastDispense.get(rx.id);
      return {
        id: rx.id,
        code: rx.code,
        status: rx.status,
        patient: patientRef(db, rx.patientId, now)!,
        prescriber: staffName(getStaff(db, rx.prescriberId)),
        setting: rx.isDischargeMedication
          ? "Discharge"
          : rx.admissionId
            ? "IPD"
            : "OPD",
        location: bed ? `${bed.ward} · ${bed.code}` : "OPD counter",
        createdAt: rx.createdAt,
        waitingMinutes: minutesBetween(rx.createdAt, now),
        items: items.filter(i => i.status !== "CANCELLED").length,
        remainingItems: open.length,
        stockShort: open.some(
          i =>
            stockOnHand(db, i.medicineId, today) <
            i.quantityPrescribed - i.quantityDispensed
        ),
        lastDispensedAt: dispensedAt,
      };
    })
    .sort((a, b) =>
      filters.view === "open"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt)
    );
}

export interface DispenseDetail {
  rx: PrescriptionView;
  patient: PatientRef;
  setting: RxQueueRow["setting"];
  location: string;
  notes: string;
  items: Array<{
    id: ID;
    medicineId: ID;
    remaining: number;
    returnable: number;
    stock: number;
    unitPrice: number;
    batches: Array<{
      id: ID;
      batchNumber: string;
      expiryDate: string;
      quantity: number;
    }>;
  }>;
}
export function dispenseDetailView(
  db: Database,
  now: Date,
  { id }: { id: ID | null }
): DispenseDetail | null {
  if (!id) return null;
  const rx = db.prescriptions.find(p => p.id === id);
  if (!rx) return null;
  const today = isoDate(now);
  const admission = rx.admissionId
    ? db.admissions.find(a => a.id === rx.admissionId)
    : undefined;
  const bed = admission ? admissionBed(db, admission) : undefined;
  return {
    rx: prescriptionView(db, rx.id),
    patient: patientRef(db, rx.patientId, now)!,
    setting: rx.isDischargeMedication
      ? "Discharge"
      : rx.admissionId
        ? "IPD"
        : "OPD",
    location: bed ? `${bed.ward} · ${bed.code}` : "OPD counter",
    notes: rx.notes,
    items: db.prescriptionItems
      .filter(i => i.prescriptionId === rx.id)
      .map(i => {
        const medicine = db.medicines.find(m => m.id === i.medicineId)!;
        return {
          id: i.id,
          medicineId: i.medicineId,
          remaining:
            i.status === "CANCELLED"
              ? 0
              : i.quantityPrescribed - i.quantityDispensed,
          returnable: i.quantityDispensed - i.quantityReturned,
          stock: stockOnHand(db, i.medicineId, today),
          unitPrice: medicine.unitPrice,
          batches: db.medicineBatches
            .filter(
              b => b.medicineId === i.medicineId && isBatchUsable(b, today)
            )
            .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
            .map(b => ({
              id: b.id,
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate,
              quantity: b.quantityOnHand,
            })),
        };
      }),
  };
}

export interface InventoryRow {
  id: ID;
  code: string;
  name: string;
  genericName: string;
  strength: string;
  form: Medicine["form"];
  unit: string;
  category: string;
  manufacturer: string;
  /** Schedule H / H1 / X — never sold over the counter. */
  prescriptionOnly: boolean;
  unitPrice: number;
  reorderLevel: number;
  stock: number;
  expiredQty: number;
  nearExpiryQty: number;
  nextExpiry?: string;
  stockValue: number;
  status: "OK" | "LOW" | "OUT";
  dispensed30: number;
  batches: Array<MedicineBatch & { expired: boolean; nearExpiry: boolean }>;
  /** Never stocked, prescribed or sold — added by mistake, so removable. */
  deletable: boolean;
}
export function inventoryView(db: Database, now: Date) {
  const today = isoDate(now);
  const soon = addDaysIso(today, 60);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const used = new Set([
    ...db.medicineBatches.map(b => b.medicineId),
    ...db.prescriptionItems.map(i => i.medicineId),
    ...db.pharmacyTransactions.map(t => t.medicineId),
  ]);
  return db.medicines.map<InventoryRow>(m => {
    const batches = db.medicineBatches
      .filter(b => b.medicineId === m.id)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const usable = batches.filter(b => isBatchUsable(b, today));
    const stock = usable.reduce((s, b) => s + b.quantityOnHand, 0);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      genericName: m.genericName,
      strength: m.strength,
      form: m.form,
      unit: m.unit,
      category: m.category,
      prescriptionOnly: m.prescriptionOnly,
      manufacturer: m.manufacturer,
      unitPrice: m.unitPrice,
      reorderLevel: m.reorderLevel,
      stock,
      expiredQty: batches
        .filter(b => b.expiryDate <= today)
        .reduce((s, b) => s + b.quantityOnHand, 0),
      nearExpiryQty: usable
        .filter(b => b.expiryDate <= soon)
        .reduce((s, b) => s + b.quantityOnHand, 0),
      nextExpiry: usable[0]?.expiryDate,
      stockValue: usable.reduce(
        (s, b) => s + b.quantityOnHand * b.costPrice,
        0
      ),
      status: stock === 0 ? "OUT" : stock <= m.reorderLevel ? "LOW" : "OK",
      dispensed30: db.pharmacyTransactions
        .filter(
          t =>
            t.medicineId === m.id &&
            (t.type === "DISPENSE" || t.type === "SALE") &&
            t.at >= since
        )
        .reduce((s, t) => s + t.quantity, 0),
      batches: batches.map(b => ({
        ...b,
        expired: b.expiryDate <= today,
        nearExpiry: b.expiryDate > today && b.expiryDate <= soon,
      })),
      deletable: !used.has(m.id),
    };
  });
}

export interface TxnRow {
  id: ID;
  code: string;
  type: PharmacyTxnType;
  at: string;
  medicine: string;
  batch: string;
  quantity: number;
  patient?: PatientRef;
  by: string;
  note: string;
  /** Goods receipts: supplier and their invoice number. */
  supplier?: string;
  reference?: string;
  prescriptionCode?: string;
  invoiceId?: ID;
  invoiceCode?: string;
  value: number;
}
export function transactionsView(
  db: Database,
  now: Date,
  filters: {
    type?: string;
    q?: string;
    days: number;
  }
) {
  const since = new Date(
    now.getTime() - filters.days * 86_400_000
  ).toISOString();
  const lineBySource = new Map(
    db.invoiceItems
      .filter(i => i.sourceType === "PHARMACY_TXN")
      .map(i => [i.sourceId, i])
  );
  return db.pharmacyTransactions
    .filter(t => t.at >= since && (!filters.type || t.type === filters.type))
    .map<TxnRow>(t => {
      const m = db.medicines.find(x => x.id === t.medicineId)!;
      const batch = db.medicineBatches.find(b => b.id === t.batchId);
      const item = t.prescriptionItemId
        ? db.prescriptionItems.find(i => i.id === t.prescriptionItemId)
        : undefined;
      const rx = item
        ? db.prescriptions.find(p => p.id === item.prescriptionId)
        : undefined;
      const line = lineBySource.get(t.id);
      const invoice = line
        ? db.invoices.find(i => i.id === line.invoiceId)
        : undefined;
      return {
        id: t.id,
        code: t.code,
        type: t.type,
        at: t.at,
        medicine: `${m.name} ${m.strength}`,
        batch: batch?.batchNumber ?? "—",
        quantity: t.quantity,
        patient: t.patientId ? patientRef(db, t.patientId, now) : undefined,
        by: staffName(getStaff(db, t.byId)),
        note: t.note,
        supplier: t.supplier,
        reference: t.reference,
        prescriptionCode: rx?.code,
        invoiceId: invoice?.id,
        invoiceCode: invoice?.code,
        value:
          t.quantity *
          (t.type === "RECEIPT" || t.type === "WRITE_OFF"
            ? (batch?.costPrice ?? 0)
            : m.unitPrice),
      };
    })
    .filter(
      r =>
        !filters.q ||
        matches(
          filters.q,
          r.code,
          r.medicine,
          r.batch,
          r.patient?.name,
          r.patient?.uhid,
          r.prescriptionCode,
          r.supplier,
          r.reference
        )
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}
