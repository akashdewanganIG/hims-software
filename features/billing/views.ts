/**
 * View builders for billing: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import {
  allInvoiceTotals,
  invoiceTotals,
  lineTotal,
  type InvoiceTotals,
} from "@/lib/domain/billing";
import {
  admissionBed,
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type {
  ChargeCategory,
  Database,
  ID,
  Invoice,
  InvoiceItem,
  Payment,
} from "@/lib/sim/schema";
import { isSameDay, isoDate } from "@/lib/sim/time";

export type BillView = "due" | "running" | "refund" | "paid" | "all";
export interface InvoiceRow extends InvoiceTotals {
  id: ID;
  code: string;
  status: Invoice["status"];
  patient: PatientRef;
  context: string;
  setting: "OPD" | "IPD";
  createdAt: string;
  categories: ChargeCategory[];
  lines: number;
}
function contextOf(db: Database, invoice: Invoice) {
  if (invoice.admissionId) {
    const a = db.admissions.find(x => x.id === invoice.admissionId);
    return {
      setting: "IPD" as const,
      context: a
        ? `${a.code} · ${a.status === "DISCHARGED" ? "discharged" : "in-house"}`
        : "Admission",
    };
  }
  const e = db.encounters.find(x => x.id === invoice.encounterId);
  return {
    setting: e?.type === "IPD" ? ("IPD" as const) : ("OPD" as const),
    context: e ? `${e.code} · ${departmentName(db, e.departmentId)}` : "—",
  };
}
export function invoicesView(
  db: Database,
  now: Date,
  filters: {
    view: BillView;
    q?: string;
    setting?: string;
    days?: number;
  }
) {
  const since = filters.days
    ? new Date(now.getTime() - filters.days * 86_400_000).toISOString()
    : undefined;
  const totals = allInvoiceTotals(db);
  const byInvoice = new Map<ID, InvoiceItem[]>();
  for (const item of db.invoiceItems)
    byInvoice.set(item.invoiceId, [
      ...(byInvoice.get(item.invoiceId) ?? []),
      item,
    ]);
  return db.invoices
    .map<InvoiceRow>(invoice => {
      const items = byInvoice.get(invoice.id) ?? [];
      return {
        id: invoice.id,
        code: invoice.code,
        status: invoice.status,
        patient: patientRef(db, invoice.patientId, now)!,
        ...contextOf(db, invoice),
        createdAt: invoice.createdAt,
        categories: [...new Set(items.map(i => i.category))],
        lines: items.length,
        ...totals.get(invoice.id)!,
      };
    })
    .filter(row => {
      if (
        filters.view === "due" &&
        row.status !== "PENDING" &&
        row.status !== "PARTIALLY_PAID"
      )
        return false;
      if (filters.view === "running" && row.status !== "DRAFT") return false;
      if (filters.view === "refund" && row.refundDue <= 0) return false;
      if (filters.view === "paid" && row.status !== "PAID") return false;
      if (filters.setting && row.setting !== filters.setting) return false;
      if (since && row.createdAt < since && row.status === "PAID") return false;
      if (
        filters.q &&
        !matches(
          filters.q,
          row.code,
          row.patient.name,
          row.patient.uhid,
          row.patient.phone,
          row.context
        )
      )
        return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function billingSummaryView(db: Database, now: Date) {
  let collectedToday = 0;
  let refundedToday = 0;
  const methods: Record<string, number> = {};
  for (const p of db.payments) {
    if (!isSameDay(p.receivedAt, now)) continue;
    if (p.kind === "PAYMENT") {
      collectedToday += p.amount;
      methods[p.method] = (methods[p.method] ?? 0) + p.amount;
    } else refundedToday += p.amount;
  }
  let outstanding = 0;
  let outstandingCount = 0;
  let running = 0;
  let runningCount = 0;
  let refundDue = 0;
  const totals = allInvoiceTotals(db);
  for (const invoice of db.invoices) {
    if (invoice.status === "CANCELLED") continue;
    const t = totals.get(invoice.id)!;
    if (invoice.status === "DRAFT") {
      running += t.total;
      runningCount += 1;
    } else if (t.balance > 0) {
      outstanding += t.balance;
      outstandingCount += 1;
    }
    if (t.refundDue > 0) refundDue += 1;
  }
  return {
    collectedToday,
    refundedToday,
    methods,
    outstanding,
    outstandingCount,
    running,
    runningCount,
    refundDue,
    billsToday: db.invoices.filter(i => isSameDay(i.createdAt, now)).length,
  };
}

export interface InvoiceDetail {
  invoice: Invoice;
  totals: InvoiceTotals;
  patient: PatientRef & { address: string; city: string };
  setting: "OPD" | "IPD";
  context: string;
  encounter?: {
    id: ID;
    code: string;
    type: string;
    doctor: string;
    department: string;
    startedAt: string;
  };
  admission?: {
    id: ID;
    code: string;
    status: string;
    bed?: string;
    admittedAt: string;
    dischargedAt?: string;
  };
  items: Array<InvoiceItem & { amount: number; sourceLabel?: string }>;
  subtotals: Array<{ category: ChargeCategory; amount: number }>;
  payments: Array<Payment & { receivedBy: string }>;
}
export function invoiceView(
  db: Database,
  now: Date,
  { id }: { id: ID }
): InvoiceDetail | null {
  const invoice = db.invoices.find(i => i.id === id);
  if (!invoice) return null;
  const patient = db.patients.find(p => p.id === invoice.patientId)!;
  const encounter = invoice.encounterId
    ? db.encounters.find(e => e.id === invoice.encounterId)
    : undefined;
  const admission = invoice.admissionId
    ? db.admissions.find(a => a.id === invoice.admissionId)
    : undefined;
  const items = db.invoiceItems
    .filter(i => i.invoiceId === id)
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
    .map(i => ({ ...i, amount: lineTotal(i) }));
  const subtotals = new Map<ChargeCategory, number>();
  for (const i of items)
    subtotals.set(i.category, (subtotals.get(i.category) ?? 0) + i.amount);
  return {
    invoice,
    totals: invoiceTotals(db, id),
    patient: {
      ...patientRef(db, patient.id, now)!,
      address: patient.address,
      city: patient.city,
    },
    ...contextOf(db, invoice),
    encounter: encounter
      ? {
          id: encounter.id,
          code: encounter.code,
          type: encounter.type,
          doctor: staffName(getStaff(db, encounter.doctorId)),
          department: departmentName(db, encounter.departmentId),
          startedAt: encounter.startedAt,
        }
      : undefined,
    admission: admission
      ? {
          id: admission.id,
          code: admission.code,
          status: admission.status,
          bed: (() => {
            const bed = admissionBed(db, admission);
            return bed ? `${bed.ward} · ${bed.code}` : undefined;
          })(),
          admittedAt: admission.admittedAt,
          dischargedAt: admission.dischargedAt,
        }
      : undefined,
    items,
    subtotals: [...subtotals.entries()].map(([category, amount]) => ({
      category,
      amount,
    })),
    payments: db.payments
      .filter(p => p.invoiceId === id)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      .map(p => ({
        ...p,
        receivedBy: staffName(getStaff(db, p.receivedById)),
      })),
  };
}

export type CollectionSource = "OPD" | "IPD" | "Pharmacy counter" | "Other";

export interface CollectionRow {
  id: ID;
  code: string;
  at: string;
  kind: Payment["kind"];
  method: Payment["method"];
  reference: string;
  amount: number;
  invoiceId: ID;
  invoiceCode: string;
  source: CollectionSource;
  patient?: PatientRef;
  byId: ID;
  by: string;
}

interface Tally {
  collected: number;
  refunded: number;
  net: number;
  receipts: number;
  refunds: number;
}

const tally = (rows: CollectionRow[]): Tally => {
  const collected = rows
    .filter(r => r.kind === "PAYMENT")
    .reduce((s, r) => s + r.amount, 0);
  const refunded = rows
    .filter(r => r.kind === "REFUND")
    .reduce((s, r) => s + r.amount, 0);
  return {
    collected: Math.round(collected * 100) / 100,
    refunded: Math.round(refunded * 100) / 100,
    net: Math.round((collected - refunded) * 100) / 100,
    receipts: rows.filter(r => r.kind === "PAYMENT").length,
    refunds: rows.filter(r => r.kind === "REFUND").length,
  };
};

/**
 * The day-end collection report (cashier closing): every receipt and
 * refund of one day, by payment method, by cashier and by source, with
 * what was billed that day by category.
 */
export function collectionsView(
  db: Database,
  now: Date,
  { date }: { date: string }
) {
  const invoices = new Map(db.invoices.map(i => [i.id, i]));
  const onDay = (iso: string) => isoDate(new Date(iso)) === date;
  const rows: CollectionRow[] = db.payments
    .filter(p => onDay(p.receivedAt))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    .map(p => {
      const invoice = invoices.get(p.invoiceId);
      return {
        id: p.id,
        code: p.code,
        at: p.receivedAt,
        kind: p.kind,
        method: p.method,
        reference: p.reference,
        amount: p.amount,
        invoiceId: p.invoiceId,
        invoiceCode: invoice?.code ?? "—",
        source: !invoice
          ? "Other"
          : invoice.admissionId
            ? "IPD"
            : invoice.encounterId
              ? "OPD"
              : "Pharmacy counter",
        patient: invoice ? patientRef(db, invoice.patientId, now) : undefined,
        byId: p.receivedById,
        by: staffName(getStaff(db, p.receivedById)),
      };
    });

  const group = <K extends string>(key: (r: CollectionRow) => K) => {
    const out = new Map<K, CollectionRow[]>();
    for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
    return [...out.entries()].map(([k, list]) => ({ key: k, ...tally(list) }));
  };

  const billed = new Map<ChargeCategory, number>();
  for (const item of db.invoiceItems) {
    if (!onDay(item.createdAt)) continue;
    if (invoices.get(item.invoiceId)?.status === "CANCELLED") continue;
    billed.set(
      item.category,
      (billed.get(item.category) ?? 0) + lineTotal(item)
    );
  }

  return {
    date,
    totals: tally(rows),
    byMethod: group(r => r.method).sort((a, b) => b.net - a.net),
    byCashier: group(r => r.by).sort((a, b) => b.net - a.net),
    bySource: group(r => r.source).sort((a, b) => b.net - a.net),
    billed: [...billed.entries()]
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount),
    rows,
  };
}
