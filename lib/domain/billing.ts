import type {
  ChargeCategory,
  ChargeSource,
  Database,
  ID,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PaymentMethod,
} from "../sim/schema";
import {
  DomainError,
  assert,
  log,
  must,
  newId,
  nextCode,
  nowIso,
  requireText,
  round2,
  touch,
  type Tx,
} from "../sim/tx";

/* ------------------------------------------------------------------ */
/* Derived totals                                                      */
/* ------------------------------------------------------------------ */

export interface InvoiceTotals {
  gross: number;
  discount: number;
  total: number;
  paid: number;
  refunded: number;
  netPaid: number;
  /** What the patient still owes (never negative). */
  balance: number;
  /** Paid in excess of the total, e.g. after a medicine return. */
  refundDue: number;
}

export function lineTotal(
  item: Pick<InvoiceItem, "quantity" | "unitPrice" | "discount">
) {
  return round2(item.quantity * item.unitPrice - item.discount);
}

/** The single source of truth for invoice money — computed, never stored. */
export function invoiceTotals(db: Database, invoiceId: ID): InvoiceTotals {
  let gross = 0;
  let discount = 0;
  for (const item of db.invoiceItems) {
    if (item.invoiceId !== invoiceId) continue;
    gross += item.quantity * item.unitPrice;
    discount += item.discount;
  }
  let paid = 0;
  let refunded = 0;
  for (const payment of db.payments) {
    if (payment.invoiceId !== invoiceId) continue;
    if (payment.kind === "PAYMENT") paid += payment.amount;
    else refunded += payment.amount;
  }
  gross = round2(gross);
  discount = round2(discount);
  const total = round2(gross - discount);
  const netPaid = round2(paid - refunded);
  return {
    gross,
    discount,
    total,
    paid: round2(paid),
    refunded: round2(refunded),
    netPaid,
    balance: round2(Math.max(0, total - netPaid)),
    refundDue: round2(Math.max(0, netPaid - total)),
  };
}

/** Same arithmetic as invoiceTotals, for every invoice in one pass (list views). */
export function allInvoiceTotals(db: Database): Map<ID, InvoiceTotals> {
  const acc = new Map<
    ID,
    { gross: number; discount: number; paid: number; refunded: number }
  >();
  const get = (id: ID) => {
    let row = acc.get(id);
    if (!row) {
      row = { gross: 0, discount: 0, paid: 0, refunded: 0 };
      acc.set(id, row);
    }
    return row;
  };
  for (const item of db.invoiceItems) {
    const row = get(item.invoiceId);
    row.gross += item.quantity * item.unitPrice;
    row.discount += item.discount;
  }
  for (const p of db.payments) {
    const row = get(p.invoiceId);
    if (p.kind === "PAYMENT") row.paid += p.amount;
    else row.refunded += p.amount;
  }
  const out = new Map<ID, InvoiceTotals>();
  for (const invoice of db.invoices) {
    const r = acc.get(invoice.id) ?? {
      gross: 0,
      discount: 0,
      paid: 0,
      refunded: 0,
    };
    const gross = round2(r.gross);
    const discount = round2(r.discount);
    const total = round2(gross - discount);
    const netPaid = round2(r.paid - r.refunded);
    out.set(invoice.id, {
      gross,
      discount,
      total,
      paid: round2(r.paid),
      refunded: round2(r.refunded),
      netPaid,
      balance: round2(Math.max(0, total - netPaid)),
      refundDue: round2(Math.max(0, netPaid - total)),
    });
  }
  return out;
}

const OPEN_STATUSES: InvoiceStatus[] = ["DRAFT", "PENDING", "PARTIALLY_PAID"];

export function isInvoiceOpen(invoice: Invoice) {
  return OPEN_STATUSES.includes(invoice.status);
}

/**
 * Status follows the money. DRAFT (an admission's running bill) and CANCELLED
 * are the only states set by hand; everything else is derived here after each
 * change so status and totals can never contradict each other.
 */
export function syncInvoiceStatus(tx: Tx, invoice: Invoice) {
  if (invoice.status === "CANCELLED") return invoice;
  if (invoice.status === "DRAFT" && !invoice.finalisedAt) return invoice;

  const t = invoiceTotals(tx.db, invoice.id);
  let next: InvoiceStatus;
  if (t.refunded > 0 && t.netPaid <= 0.005) next = "REFUNDED";
  else if (t.total <= 0.005 && t.netPaid >= t.total) next = "PAID";
  else if (t.netPaid <= 0.005) next = "PENDING";
  else if (t.netPaid < t.total - 0.005) next = "PARTIALLY_PAID";
  else next = "PAID";

  if (next !== invoice.status) {
    invoice.status = next;
    touch(tx, invoice);
  }
  return invoice;
}

/* ------------------------------------------------------------------ */
/* Charge posting — the only way other modules touch billing           */
/* ------------------------------------------------------------------ */

export interface ChargeTarget {
  patientId: ID;
  encounterId?: ID;
  admissionId?: ID;
}

export interface ChargeLine {
  category: ChargeCategory;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  sourceType: ChargeSource;
  sourceId?: ID;
  serviceDate?: string;
}

function createInvoice(tx: Tx, target: ChargeTarget, status: InvoiceStatus) {
  const invoice: Invoice = {
    id: newId(tx, "inv"),
    code: nextCode(tx, "INV"),
    patientId: target.patientId,
    encounterId: target.encounterId,
    admissionId: target.admissionId,
    status,
    notes: "",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.invoices.push(invoice);
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "created",
    summary: `Invoice ${invoice.code} opened`,
  });
  return invoice;
}

/**
 * Admissions accumulate on one running (DRAFT) bill. OPD visits reuse the
 * visit's unpaid bill; once that is settled, later charges (a medicine
 * dispensed after payment, say) start a fresh bill for the same encounter.
 */
export function openInvoiceFor(tx: Tx, target: ChargeTarget): Invoice {
  if (target.admissionId) {
    const running = tx.db.invoices.find(
      invoice =>
        invoice.admissionId === target.admissionId && invoice.status === "DRAFT"
    );
    if (running) return running;
    const admission = must(tx.db.admissions, target.admissionId, "Admission");
    assert(
      admission.status !== "DISCHARGED",
      "This admission is discharged; its bill is final and cannot take new charges."
    );
    return createInvoice(tx, target, "DRAFT");
  }

  const existing = tx.db.invoices.find(
    invoice =>
      invoice.encounterId === target.encounterId &&
      invoice.patientId === target.patientId &&
      !invoice.admissionId &&
      (invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID")
  );
  return existing ?? createInvoice(tx, target, "PENDING");
}

/**
 * A bill of its own for a sale at a counter (no visit or admission), so each
 * counter sale is settled — or left open — independently.
 */
export function openCounterBill(tx: Tx, patientId: ID, notes: string) {
  must(tx.db.patients, patientId, "Patient");
  const invoice = createInvoice(tx, { patientId }, "PENDING");
  invoice.notes = notes;
  return invoice;
}

/** Adds a charge line to a specific open bill. */
export function chargeTo(tx: Tx, invoiceId: ID, line: ChargeLine) {
  const invoice = must(tx.db.invoices, invoiceId, "Invoice");
  assert(isInvoiceOpen(invoice), `Bill ${invoice.code} is closed.`);
  return addLine(tx, invoice, line);
}

export function postCharge(tx: Tx, target: ChargeTarget, line: ChargeLine) {
  const invoice = openInvoiceFor(tx, target);
  return addLine(tx, invoice, line);
}

function addLine(tx: Tx, invoice: Invoice, line: ChargeLine) {
  assert(line.unitPrice >= 0, "Unit price cannot be negative.");
  const item: InvoiceItem = {
    id: newId(tx, "ini"),
    invoiceId: invoice.id,
    category: line.category,
    description: line.description,
    quantity: line.quantity,
    unitPrice: round2(line.unitPrice),
    discount: round2(line.discount ?? 0),
    sourceType: line.sourceType,
    sourceId: line.sourceId,
    serviceDate: line.serviceDate ?? nowIso(tx),
    createdAt: nowIso(tx),
  };
  tx.db.invoiceItems.push(item);
  touch(tx, invoice);
  syncInvoiceStatus(tx, invoice);
  return item;
}

/**
 * A credit (e.g. returned medicine) lands on the bill that carried the
 * original charge, even if that bill is already paid — the overpayment then
 * shows up as a refund due in Billing.
 */
export function postCredit(tx: Tx, invoiceId: ID, line: ChargeLine) {
  const invoice = must(tx.db.invoices, invoiceId, "Invoice");
  assert(invoice.status !== "CANCELLED", "The original bill was cancelled.");
  return addLine(tx, invoice, { ...line, quantity: -Math.abs(line.quantity) });
}

/**
 * Withdraw charges for something that did not happen (a cancelled lab order).
 * Refuses once money has been taken against the bill — that needs a refund.
 */
export function withdrawCharges(
  tx: Tx,
  sourceType: ChargeSource,
  sourceIds: ID[]
) {
  const lines = tx.db.invoiceItems.filter(
    item =>
      item.sourceType === sourceType &&
      item.sourceId &&
      sourceIds.includes(item.sourceId)
  );
  const invoiceIds = [...new Set(lines.map(line => line.invoiceId))];
  for (const invoiceId of invoiceIds) {
    const invoice = must(tx.db.invoices, invoiceId, "Invoice");
    const totals = invoiceTotals(tx.db, invoiceId);
    if (totals.paid > 0 || invoice.status === "CANCELLED") {
      throw new DomainError(
        `Bill ${invoice.code} already has payments against it. Refund the amount from Billing instead of withdrawing the charge.`
      );
    }
  }
  tx.db.invoiceItems = tx.db.invoiceItems.filter(item => !lines.includes(item));
  for (const invoiceId of invoiceIds) {
    const invoice = must(tx.db.invoices, invoiceId, "Invoice");
    touch(tx, invoice);
    syncInvoiceStatus(tx, invoice);
  }
  return lines.length;
}

/* ------------------------------------------------------------------ */
/* Billing desk operations                                             */
/* ------------------------------------------------------------------ */

export function addManualCharge(
  tx: Tx,
  invoiceId: ID,
  input: {
    category: ChargeCategory;
    description: string;
    quantity: number;
    unitPrice: number;
  }
) {
  const invoice = must(tx.db.invoices, invoiceId, "Invoice");
  assert(
    isInvoiceOpen(invoice),
    `Bill ${invoice.code} is ${invoice.status.toLowerCase().replace("_", " ")} and cannot take new charges.`
  );
  assert(
    Number.isInteger(input.quantity) && input.quantity > 0,
    "Quantity must be a whole number above zero."
  );
  assert(
    Number.isFinite(input.unitPrice) && input.unitPrice >= 0,
    "Rate cannot be negative."
  );
  const item = addLine(tx, invoice, {
    category: input.category,
    description: requireText(input.description, "Description"),
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    sourceType: "MANUAL",
  });
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "charge_added",
    summary: `Charge added to ${invoice.code}: ${item.description}`,
  });
  return item;
}

export function setLineDiscount(tx: Tx, itemId: ID, discount: number) {
  const item = must(tx.db.invoiceItems, itemId, "Bill line");
  const invoice = must(tx.db.invoices, item.invoiceId, "Invoice");
  assert(
    isInvoiceOpen(invoice),
    "Discounts can only change on an unsettled bill."
  );
  const gross = item.quantity * item.unitPrice;
  assert(gross > 0, "Credit lines cannot be discounted.");
  assert(
    discount >= 0 && discount <= gross,
    "Discount must be between zero and the line amount."
  );
  item.discount = round2(discount);
  touch(tx, invoice);
  syncInvoiceStatus(tx, invoice);
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "discount",
    summary: `Discount of ₹${item.discount} applied on ${invoice.code}`,
  });
  return item;
}

/**
 * Removes a charge keyed in at the billing desk (entered by mistake, say).
 * Charges the system posted follow their source instead — cancel the lab
 * order, return the medicine — so the bill never disagrees with the record.
 */
export function removeManualCharge(tx: Tx, itemId: ID) {
  const item = must(tx.db.invoiceItems, itemId, "Bill line");
  const invoice = must(tx.db.invoices, item.invoiceId, "Invoice");
  assert(
    item.sourceType === "MANUAL",
    "Only charges added at the billing desk can be removed. System charges follow their source: cancel the order or return the medicine instead."
  );
  assert(
    isInvoiceOpen(invoice),
    `Bill ${invoice.code} is ${invoice.status.toLowerCase().replace("_", " ")}; its charges can no longer change.`
  );
  const totals = invoiceTotals(tx.db, invoice.id);
  const amount = lineTotal(item);
  assert(
    totals.netPaid <= totals.total - amount + 0.005,
    `Payments on ${invoice.code} already exceed what it would total without this charge. Refund the difference first.`
  );
  tx.db.invoiceItems = tx.db.invoiceItems.filter(i => i.id !== item.id);
  touch(tx, invoice);
  syncInvoiceStatus(tx, invoice);
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "charge_removed",
    summary: `Charge removed from ${invoice.code}: ${item.description}`,
  });
  return invoice;
}

/** Largest single advance deposit taken against a running bill. */
export const MAX_DEPOSIT = 500_000;

export function recordPayment(
  tx: Tx,
  invoiceId: ID,
  input: {
    amount: number;
    method: PaymentMethod;
    reference?: string;
    note?: string;
  }
) {
  const invoice = must(tx.db.invoices, invoiceId, "Invoice");
  assert(invoice.status !== "CANCELLED", "This bill is cancelled.");
  const totals = invoiceTotals(tx.db, invoiceId);
  const amount = round2(input.amount);
  assert(amount > 0, "Payment amount must be greater than zero.");
  // An admission's running bill takes advance deposits (IP advance) beyond
  // the charges so far; any excess shows as a refund due on the final bill.
  const deposit = invoice.status === "DRAFT" && !invoice.finalisedAt;
  assert(
    deposit || amount <= totals.balance + 0.005,
    `Payment exceeds the outstanding balance of ₹${totals.balance.toLocaleString("en-IN")}.`
  );
  assert(
    !deposit || amount <= MAX_DEPOSIT,
    `A single deposit cannot exceed ₹${MAX_DEPOSIT.toLocaleString("en-IN")}.`
  );
  const payment = {
    id: newId(tx, "pay"),
    code: nextCode(tx, "RCP"),
    invoiceId,
    kind: "PAYMENT" as const,
    amount,
    method: input.method,
    reference: input.reference?.trim() ?? "",
    receivedAt: nowIso(tx),
    receivedById: tx.actorId,
    note: input.note?.trim() ?? "",
  };
  tx.db.payments.push(payment);
  touch(tx, invoice);
  syncInvoiceStatus(tx, invoice);
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "payment",
    summary: `₹${amount.toLocaleString("en-IN")} received on ${invoice.code} (${input.method.replace("_", " ").toLowerCase()})`,
  });
  return payment;
}

export function recordRefund(
  tx: Tx,
  invoiceId: ID,
  input: { amount: number; method: PaymentMethod; reason: string }
) {
  const invoice = must(tx.db.invoices, invoiceId, "Invoice");
  const totals = invoiceTotals(tx.db, invoiceId);
  const amount = round2(input.amount);
  assert(amount > 0, "Refund amount must be greater than zero.");
  assert(
    amount <= totals.netPaid + 0.005,
    `Refund cannot exceed the ₹${totals.netPaid.toLocaleString("en-IN")} collected on this bill.`
  );
  const payment = {
    id: newId(tx, "pay"),
    code: nextCode(tx, "RFD"),
    invoiceId,
    kind: "REFUND" as const,
    amount,
    method: input.method,
    reference: "",
    receivedAt: nowIso(tx),
    receivedById: tx.actorId,
    note: requireText(input.reason, "Refund reason"),
  };
  tx.db.payments.push(payment);
  touch(tx, invoice);
  syncInvoiceStatus(tx, invoice);
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "refund",
    summary: `₹${amount.toLocaleString("en-IN")} refunded on ${invoice.code}`,
  });
  return payment;
}

/** Issues an admission's running bill for payment. */
export function finaliseInvoice(tx: Tx, invoiceId: ID) {
  const invoice = must(tx.db.invoices, invoiceId, "Invoice");
  assert(
    invoice.status === "DRAFT",
    "Only a running (draft) bill can be finalised."
  );
  invoice.finalisedAt = nowIso(tx);
  invoice.status = "PENDING";
  touch(tx, invoice);
  syncInvoiceStatus(tx, invoice);
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "finalised",
    summary: `Final bill ${invoice.code} issued`,
  });
  return invoice;
}

export function cancelInvoice(tx: Tx, invoiceId: ID, reason: string) {
  const invoice = must(tx.db.invoices, invoiceId, "Invoice");
  assert(invoice.status !== "CANCELLED", "This bill is already cancelled.");
  assert(
    !invoice.admissionId || invoice.status !== "DRAFT",
    "An admission's running bill closes at discharge; it cannot be cancelled while the patient is admitted."
  );
  const totals = invoiceTotals(tx.db, invoiceId);
  assert(
    totals.netPaid <= 0.005,
    "Refund all collected amounts before cancelling this bill."
  );
  invoice.status = "CANCELLED";
  invoice.cancelledAt = nowIso(tx);
  invoice.cancelReason = requireText(reason, "Cancellation reason");
  touch(tx, invoice);
  log(tx, {
    entityType: "invoice",
    entityId: invoice.id,
    patientId: invoice.patientId,
    action: "cancelled",
    summary: `Bill ${invoice.code} cancelled: ${invoice.cancelReason}`,
  });
  return invoice;
}
