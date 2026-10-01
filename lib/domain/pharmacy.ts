import type {
  Database,
  Frequency,
  ID,
  PaymentMethod,
  Medicine,
  MedicineBatch,
  MedicineForm,
  PharmacyTransaction,
  Prescription,
  PrescriptionItem,
  Route,
} from "../sim/schema";
import { isoDate } from "../sim/time";
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
import {
  chargeTo,
  invoiceTotals,
  openCounterBill,
  postCharge,
  postCredit,
  recordPayment,
} from "./billing";
import { activateAdmission, assertEncounterAcceptsOrders } from "./encounters";

export const DOSES_PER_DAY: Record<Frequency, number> = {
  OD: 1,
  BD: 2,
  TDS: 3,
  QID: 4,
  HS: 1,
  SOS: 1,
  STAT: 1,
};

const COUNTED_FORMS = new Set(["TABLET", "CAPSULE", "INJECTION", "INFUSION"]);

/** Units to dispense for a course: counted forms by dose, packs otherwise. */
export function suggestQuantity(
  medicine: Medicine,
  frequency: Frequency,
  durationDays: number
) {
  if (!COUNTED_FORMS.has(medicine.form)) return 1;
  if (frequency === "STAT") return 1;
  return Math.max(1, DOSES_PER_DAY[frequency] * Math.max(1, durationDays));
}

export function isBatchUsable(batch: MedicineBatch, today: string) {
  return batch.quantityOnHand > 0 && batch.expiryDate > today;
}

export function stockOnHand(db: Database, medicineId: ID, today: string) {
  let qty = 0;
  for (const batch of db.medicineBatches) {
    if (batch.medicineId === medicineId && isBatchUsable(batch, today))
      qty += batch.quantityOnHand;
  }
  return qty;
}

export interface PrescriptionItemInput {
  medicineId: ID;
  dose: string;
  frequency: Frequency;
  route: Route;
  durationDays: number;
  quantity?: number;
  instructions?: string;
}

export function createPrescription(
  tx: Tx,
  input: {
    encounterId: ID;
    items: PrescriptionItemInput[];
    notes?: string;
    isDischargeMedication?: boolean;
  }
): Prescription {
  const encounter = must(tx.db.encounters, input.encounterId, "Encounter");
  assertEncounterAcceptsOrders(tx, encounter, {
    allowDischargePending: Boolean(input.isDischargeMedication),
  });
  assert(input.items.length > 0, "Add at least one medicine.");

  const prescription: Prescription = {
    id: newId(tx, "rx"),
    code: nextCode(tx, "RX"),
    patientId: encounter.patientId,
    encounterId: encounter.id,
    admissionId: encounter.admissionId,
    prescriberId: tx.actorId,
    status: "PENDING",
    notes: input.notes?.trim() ?? "",
    isDischargeMedication: input.isDischargeMedication || undefined,
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.prescriptions.push(prescription);

  const patient = must(tx.db.patients, encounter.patientId, "Patient");
  for (const line of input.items) {
    const medicine = must(tx.db.medicines, line.medicineId, "Medicine");
    const allergy = patient.allergies.find(a =>
      [medicine.name, medicine.genericName, medicine.category].some(v =>
        v.toLowerCase().includes(a.toLowerCase())
      )
    );
    if (allergy) {
      throw new DomainError(
        `${patient.firstName} is recorded as allergic to ${allergy}. Remove ${medicine.name} or update the allergy list.`
      );
    }
    assert(
      Number.isInteger(line.durationDays) && line.durationDays > 0,
      `Duration for ${medicine.name} must be a whole number of days.`
    );
    const quantity =
      line.quantity ??
      suggestQuantity(medicine, line.frequency, line.durationDays);
    assert(
      quantity > 0 && Number.isInteger(quantity),
      `Quantity for ${medicine.name} must be a whole number.`
    );
    const item: PrescriptionItem = {
      id: newId(tx, "rxi"),
      prescriptionId: prescription.id,
      medicineId: medicine.id,
      dose: requireText(line.dose, `Dose for ${medicine.name}`),
      frequency: line.frequency,
      route: line.route,
      durationDays: line.durationDays,
      quantityPrescribed: quantity,
      quantityDispensed: 0,
      quantityReturned: 0,
      instructions: line.instructions?.trim() ?? "",
      status: "PENDING",
    };
    tx.db.prescriptionItems.push(item);
  }

  if (prescription.admissionId) activateAdmission(tx, prescription.admissionId);
  log(tx, {
    entityType: "prescription",
    entityId: prescription.id,
    patientId: prescription.patientId,
    action: "prescribed",
    summary: `Prescription ${prescription.code} sent to pharmacy (${input.items.length} item${input.items.length === 1 ? "" : "s"})`,
  });
  return prescription;
}

function syncPrescriptionStatus(tx: Tx, prescription: Prescription) {
  const items = tx.db.prescriptionItems.filter(
    i => i.prescriptionId === prescription.id
  );
  const live = items.filter(i => i.status !== "CANCELLED");
  let status: Prescription["status"];
  if (live.length === 0) status = "CANCELLED";
  else if (live.every(i => i.status === "DISPENSED")) status = "DISPENSED";
  else if (live.some(i => i.quantityDispensed > 0))
    status = "PARTIALLY_DISPENSED";
  else status = "PENDING";
  if (status !== prescription.status) {
    prescription.status = status;
    touch(tx, prescription);
  }
}

function chargeTarget(tx: Tx, prescription: Prescription) {
  const admission = prescription.admissionId
    ? must(tx.db.admissions, prescription.admissionId, "Admission")
    : undefined;
  // Medicines collected after the patient has gone home are billed on a
  // separate bill for the encounter; the admission's final bill is closed.
  if (admission && admission.status !== "DISCHARGED") {
    return {
      patientId: prescription.patientId,
      encounterId: prescription.encounterId,
      admissionId: admission.id,
    };
  }
  return {
    patientId: prescription.patientId,
    encounterId: prescription.encounterId,
  };
}

/**
 * Dispense against a prescription. Stock is drawn first-expiry-first-out
 * across batches; each batch draw is a pharmacy transaction with its own bill
 * line, so stock, dispensing history and billing always reconcile.
 */
export function dispense(
  tx: Tx,
  prescriptionId: ID,
  lines: Array<{ itemId: ID; quantity: number }>
) {
  const prescription = must(
    tx.db.prescriptions,
    prescriptionId,
    "Prescription"
  );
  assert(
    prescription.status === "PENDING" ||
      prescription.status === "PARTIALLY_DISPENSED",
    `Prescription ${prescription.code} is ${prescription.status.replace(/_/g, " ").toLowerCase()}.`
  );
  const today = isoDate(tx.now);
  const requested = lines.filter(line => line.quantity > 0);
  assert(
    requested.length > 0,
    "Enter a quantity to dispense for at least one medicine."
  );

  const txns: PharmacyTransaction[] = [];
  for (const line of requested) {
    const item = must(
      tx.db.prescriptionItems,
      line.itemId,
      "Prescription item"
    );
    assert(
      item.prescriptionId === prescription.id,
      "Item does not belong to this prescription."
    );
    assert(
      item.status !== "CANCELLED",
      "This item was cancelled by the prescriber."
    );
    assert(Number.isInteger(line.quantity), "Quantities must be whole units.");
    const medicine = must(tx.db.medicines, item.medicineId, "Medicine");
    const remaining = item.quantityPrescribed - item.quantityDispensed;
    assert(
      line.quantity <= remaining,
      `Only ${remaining} ${medicine.unit}(s) of ${medicine.name} remain to be dispensed.`
    );
    const available = stockOnHand(tx.db, medicine.id, today);
    if (available < line.quantity) {
      throw new DomainError(
        `Not enough ${medicine.name} in stock: ${available} usable ${medicine.unit}(s) on hand, ${line.quantity} requested.`
      );
    }

    let toDraw = line.quantity;
    const batches = tx.db.medicineBatches
      .filter(b => b.medicineId === medicine.id && isBatchUsable(b, today))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    for (const batch of batches) {
      if (toDraw <= 0) break;
      const take = Math.min(batch.quantityOnHand, toDraw);
      batch.quantityOnHand -= take;
      toDraw -= take;
      const txn: PharmacyTransaction = {
        id: newId(tx, "ptx"),
        code: nextCode(tx, "PTX"),
        type: "DISPENSE",
        medicineId: medicine.id,
        batchId: batch.id,
        quantity: take,
        prescriptionItemId: item.id,
        patientId: prescription.patientId,
        at: nowIso(tx),
        byId: tx.actorId,
        note: `Against ${prescription.code}`,
      };
      tx.db.pharmacyTransactions.push(txn);
      txns.push(txn);
      postCharge(tx, chargeTarget(tx, prescription), {
        category: "PHARMACY",
        description: `${medicine.name} ${medicine.strength} · batch ${batch.batchNumber}`,
        quantity: take,
        unitPrice: medicine.unitPrice,
        sourceType: "PHARMACY_TXN",
        sourceId: txn.id,
      });
    }

    item.quantityDispensed += line.quantity;
    item.status =
      item.quantityDispensed >= item.quantityPrescribed
        ? "DISPENSED"
        : "PARTIAL";
  }

  syncPrescriptionStatus(tx, prescription);
  touch(tx, prescription);
  log(tx, {
    entityType: "prescription",
    entityId: prescription.id,
    patientId: prescription.patientId,
    action: "dispensed",
    summary: `${prescription.code} ${(prescription.status as Prescription["status"]) === "DISPENSED" ? "fully" : "partly"} dispensed`,
  });
  return txns;
}

/** Closes out the undispensed remainder of a prescription line. */
function cancelPrescriptionItem(tx: Tx, itemId: ID, reason: string) {
  const item = must(tx.db.prescriptionItems, itemId, "Prescription item");
  const prescription = must(
    tx.db.prescriptions,
    item.prescriptionId,
    "Prescription"
  );
  assert(
    item.status === "PENDING" || item.status === "PARTIAL",
    "Only undispensed items can be cancelled."
  );
  if (item.quantityDispensed > 0) {
    // Keep what was handed over; stop the rest.
    item.quantityPrescribed = item.quantityDispensed;
    item.status = "DISPENSED";
  } else {
    item.status = "CANCELLED";
  }
  item.instructions = [
    item.instructions,
    `Stopped: ${requireText(reason, "Reason")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  syncPrescriptionStatus(tx, prescription);
  touch(tx, prescription);
  return item;
}

/**
 * The prescriber withdraws a prescription the pharmacy has not started on —
 * a wrong medicine, a changed plan. Once anything has been dispensed the
 * pharmacy closes the remainder instead, so nothing handed over is undone.
 */
export function cancelPrescription(tx: Tx, prescriptionId: ID, reason: string) {
  const prescription = must(
    tx.db.prescriptions,
    prescriptionId,
    "Prescription"
  );
  assert(
    prescription.status !== "CANCELLED",
    `${prescription.code} is already cancelled.`
  );
  assert(
    prescription.status === "PENDING",
    `Part of ${prescription.code} has already been dispensed. Ask the pharmacy to close what is left.`
  );
  const why = requireText(reason, "Reason");
  for (const item of tx.db.prescriptionItems.filter(
    i => i.prescriptionId === prescription.id && i.status === "PENDING"
  ))
    cancelPrescriptionItem(tx, item.id, why);
  log(tx, {
    entityType: "prescription",
    entityId: prescription.id,
    patientId: prescription.patientId,
    action: "cancelled",
    summary: `${prescription.code} cancelled by the prescriber: ${why}`,
  });
  return prescription;
}

/** Closes whatever is still undispensed on a prescription the patient did not collect. */
export function closeUncollected(tx: Tx, prescriptionId: ID, reason: string) {
  const prescription = must(
    tx.db.prescriptions,
    prescriptionId,
    "Prescription"
  );
  assert(
    prescription.status === "PENDING" ||
      prescription.status === "PARTIALLY_DISPENSED",
    "Only prescriptions still awaiting dispensing can be closed."
  );
  const why = requireText(reason, "Reason");
  for (const item of tx.db.prescriptionItems.filter(
    i =>
      i.prescriptionId === prescription.id &&
      (i.status === "PENDING" || i.status === "PARTIAL")
  )) {
    cancelPrescriptionItem(tx, item.id, why);
  }
  log(tx, {
    entityType: "prescription",
    entityId: prescription.id,
    patientId: prescription.patientId,
    action: "closed",
    summary: `${prescription.code} closed: ${why}`,
  });
  return prescription;
}

export function returnMedicine(
  tx: Tx,
  itemId: ID,
  quantity: number,
  reason: string
) {
  const item = must(tx.db.prescriptionItems, itemId, "Prescription item");
  const prescription = must(
    tx.db.prescriptions,
    item.prescriptionId,
    "Prescription"
  );
  const medicine = must(tx.db.medicines, item.medicineId, "Medicine");
  const returnable = item.quantityDispensed - item.quantityReturned;
  assert(
    Number.isInteger(quantity) && quantity > 0,
    "Return quantity must be a whole number above zero."
  );
  assert(
    quantity <= returnable,
    `Only ${returnable} ${medicine.unit}(s) of ${medicine.name} can be returned.`
  );
  const why = requireText(reason, "Return reason");

  // Put units back into the batches they came from, most recent first.
  const dispensed = tx.db.pharmacyTransactions
    .filter(t => t.prescriptionItemId === item.id && t.type === "DISPENSE")
    .sort((a, b) => b.at.localeCompare(a.at));
  let left = quantity;
  for (const out of dispensed) {
    if (left <= 0) break;
    const alreadyBack = tx.db.pharmacyTransactions
      .filter(
        t =>
          t.type === "RETURN" &&
          t.prescriptionItemId === item.id &&
          t.note.includes(out.code)
      )
      .reduce((sum, t) => sum + t.quantity, 0);
    const take = Math.min(out.quantity - alreadyBack, left);
    if (take <= 0) continue;
    const batch = must(tx.db.medicineBatches, out.batchId, "Batch");
    batch.quantityOnHand += take;
    left -= take;
    const txn: PharmacyTransaction = {
      id: newId(tx, "ptx"),
      code: nextCode(tx, "PTX"),
      type: "RETURN",
      medicineId: medicine.id,
      batchId: batch.id,
      quantity: take,
      prescriptionItemId: item.id,
      patientId: prescription.patientId,
      at: nowIso(tx),
      byId: tx.actorId,
      note: `Return of ${out.code}: ${why}`,
    };
    tx.db.pharmacyTransactions.push(txn);
    const originalLine = tx.db.invoiceItems.find(
      line => line.sourceType === "PHARMACY_TXN" && line.sourceId === out.id
    );
    if (originalLine) {
      postCredit(tx, originalLine.invoiceId, {
        category: "PHARMACY",
        description: `Returned: ${medicine.name} ${medicine.strength} · batch ${batch.batchNumber}`,
        quantity: take,
        unitPrice: medicine.unitPrice,
        sourceType: "PHARMACY_TXN",
        sourceId: txn.id,
      });
    }
  }
  item.quantityReturned += quantity;
  touch(tx, prescription);
  log(tx, {
    entityType: "pharmacy",
    entityId: prescription.id,
    patientId: prescription.patientId,
    action: "returned",
    summary: `${quantity} ${medicine.unit}(s) of ${medicine.name} returned to pharmacy`,
  });
}

export function receiveStock(
  tx: Tx,
  input: {
    medicineId: ID;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    costPrice: number;
    /** The distributor and their invoice — a goods receipt note (GRN). */
    supplier: string;
    invoiceNumber: string;
  }
) {
  const medicine = must(tx.db.medicines, input.medicineId, "Medicine");
  const supplier = requireText(input.supplier, "Supplier");
  const invoiceNumber = requireText(
    input.invoiceNumber,
    "Supplier invoice number"
  );
  const batchNumber = requireText(
    input.batchNumber,
    "Batch number"
  ).toUpperCase();
  assert(
    Number.isInteger(input.quantity) && input.quantity > 0,
    "Quantity must be a whole number above zero."
  );
  assert(
    input.expiryDate > isoDate(tx.now),
    "Expiry date must be in the future."
  );
  assert(
    Number.isFinite(input.costPrice) && input.costPrice >= 0,
    "Cost price cannot be negative."
  );
  let batch = tx.db.medicineBatches.find(
    b => b.medicineId === medicine.id && b.batchNumber === batchNumber
  );
  if (batch) {
    assert(
      batch.expiryDate === input.expiryDate,
      `Batch ${batchNumber} already exists with a different expiry date.`
    );
    batch.quantityOnHand += input.quantity;
  } else {
    batch = {
      id: newId(tx, "bat"),
      medicineId: medicine.id,
      batchNumber,
      expiryDate: input.expiryDate,
      quantityOnHand: input.quantity,
      receivedAt: nowIso(tx),
      costPrice: round2(input.costPrice),
    };
    tx.db.medicineBatches.push(batch);
  }
  tx.db.pharmacyTransactions.push({
    id: newId(tx, "ptx"),
    code: nextCode(tx, "PTX"),
    type: "RECEIPT",
    medicineId: medicine.id,
    batchId: batch.id,
    quantity: input.quantity,
    at: nowIso(tx),
    byId: tx.actorId,
    note: `Stock received · batch ${batchNumber}`,
    supplier,
    reference: invoiceNumber,
  });
  log(tx, {
    entityType: "pharmacy",
    entityId: medicine.id,
    action: "received",
    summary: `${input.quantity} ${medicine.unit}(s) of ${medicine.name} received from ${supplier} (invoice ${invoiceNumber}, batch ${batchNumber})`,
  });
  return batch;
}

/**
 * Over-the-counter sale: medicines sold without a prescription to a
 * registered patient, drawn first-expiry-first-out onto a pharmacy bill of
 * their own — paid at the counter, or left open for the billing desk.
 * Schedule H / H1 / X medicines are refused: they need a prescription.
 */
export function counterSale(
  tx: Tx,
  input: {
    patientId: ID;
    lines: Array<{ medicineId: ID; quantity: number }>;
    payment?: { method: PaymentMethod; reference?: string };
  }
) {
  const patient = must(tx.db.patients, input.patientId, "Patient");
  const lines = input.lines.filter(line => line.quantity > 0);
  assert(lines.length > 0, "Add at least one medicine with a quantity.");
  assert(
    new Set(lines.map(line => line.medicineId)).size === lines.length,
    "List each medicine once."
  );
  const today = isoDate(tx.now);
  const medicines = lines.map(line => {
    const medicine = must(tx.db.medicines, line.medicineId, "Medicine");
    assert(Number.isInteger(line.quantity), "Quantities must be whole units.");
    assert(
      !medicine.prescriptionOnly,
      `${medicine.name} ${medicine.strength} is a prescription-only (Schedule H) medicine. Dispense it against a doctor's prescription.`
    );
    const available = stockOnHand(tx.db, medicine.id, today);
    assert(
      available >= line.quantity,
      `Not enough ${medicine.name} in stock: ${available} usable ${medicine.unit}(s) on hand, ${line.quantity} requested.`
    );
    return medicine;
  });

  const bill = openCounterBill(
    tx,
    patient.id,
    "Pharmacy counter sale (over the counter)"
  );
  const txns: PharmacyTransaction[] = [];
  lines.forEach((line, index) => {
    const medicine = medicines[index]!;
    let toDraw = line.quantity;
    const batches = tx.db.medicineBatches
      .filter(b => b.medicineId === medicine.id && isBatchUsable(b, today))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    for (const batch of batches) {
      if (toDraw <= 0) break;
      const take = Math.min(batch.quantityOnHand, toDraw);
      batch.quantityOnHand -= take;
      toDraw -= take;
      const txn: PharmacyTransaction = {
        id: newId(tx, "ptx"),
        code: nextCode(tx, "PTX"),
        type: "SALE",
        medicineId: medicine.id,
        batchId: batch.id,
        quantity: take,
        patientId: patient.id,
        at: nowIso(tx),
        byId: tx.actorId,
        note: `Counter sale · ${bill.code}`,
      };
      tx.db.pharmacyTransactions.push(txn);
      txns.push(txn);
      chargeTo(tx, bill.id, {
        category: "PHARMACY",
        description: `${medicine.name} ${medicine.strength} · batch ${batch.batchNumber}`,
        quantity: take,
        unitPrice: medicine.unitPrice,
        sourceType: "PHARMACY_TXN",
        sourceId: txn.id,
      });
    }
  });

  const total = invoiceTotals(tx.db, bill.id).total;
  if (input.payment)
    recordPayment(tx, bill.id, {
      amount: total,
      method: input.payment.method,
      reference: input.payment.reference,
      note: "Paid at the pharmacy counter",
    });
  log(tx, {
    entityType: "pharmacy",
    entityId: bill.id,
    patientId: patient.id,
    action: "counter_sale",
    summary: `Counter sale ${bill.code} to ${patient.firstName} ${patient.lastName}: ${lines.length} item(s), ₹${total.toLocaleString("en-IN")}${input.payment ? " paid" : " on account"}`,
  });
  return { invoiceId: bill.id, code: bill.code, total, transactions: txns };
}

export function writeOffBatch(tx: Tx, batchId: ID, reason: string) {
  const batch = must(tx.db.medicineBatches, batchId, "Batch");
  const medicine = must(tx.db.medicines, batch.medicineId, "Medicine");
  assert(batch.quantityOnHand > 0, "This batch has no stock left.");
  const quantity = batch.quantityOnHand;
  batch.quantityOnHand = 0;
  tx.db.pharmacyTransactions.push({
    id: newId(tx, "ptx"),
    code: nextCode(tx, "PTX"),
    type: "WRITE_OFF",
    medicineId: medicine.id,
    batchId: batch.id,
    quantity,
    at: nowIso(tx),
    byId: tx.actorId,
    note: requireText(reason, "Reason"),
  });
  log(tx, {
    entityType: "pharmacy",
    entityId: medicine.id,
    action: "write_off",
    summary: `${quantity} ${medicine.unit}(s) of ${medicine.name} written off (batch ${batch.batchNumber})`,
  });
}

/* ------------------------------------------------------------------ */
/* Formulary (item master)                                             */
/* ------------------------------------------------------------------ */

export interface MedicineInput {
  name: string;
  genericName: string;
  form: MedicineForm;
  strength: string;
  unit: string;
  category: string;
  unitPrice: number;
  reorderLevel: number;
  manufacturer: string;
  prescriptionOnly: boolean;
}

function medicineDetails(tx: Tx, input: MedicineInput, selfId?: ID) {
  const name = requireText(input.name, "Brand name");
  const strength = requireText(input.strength, "Strength");
  assert(
    Number.isFinite(input.unitPrice) && input.unitPrice >= 0,
    "Selling price cannot be negative."
  );
  assert(
    Number.isInteger(input.reorderLevel) && input.reorderLevel >= 0,
    "Reorder level must be a whole number of units."
  );
  const clash = tx.db.medicines.find(
    m =>
      m.id !== selfId &&
      m.form === input.form &&
      m.name.toLowerCase() === name.toLowerCase() &&
      m.strength.toLowerCase() === strength.toLowerCase()
  );
  assert(
    !clash,
    `${name} ${strength} is already in the formulary as ${clash?.code}.`
  );
  return {
    name,
    genericName: requireText(input.genericName, "Generic name"),
    form: input.form,
    strength,
    unit: requireText(input.unit, "Dispensing unit").toLowerCase(),
    category: requireText(input.category, "Category"),
    unitPrice: round2(input.unitPrice),
    reorderLevel: input.reorderLevel,
    manufacturer: requireText(input.manufacturer, "Manufacturer"),
    prescriptionOnly: input.prescriptionOnly,
  };
}

/** Item code from the brand and strength, e.g. "AMOX500"; unique. */
function itemCode(db: Database, name: string, strength: string) {
  const base =
    (name
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 5) || "MED") + strength.replace(/[^0-9]/g, "").slice(0, 4);
  let code = base;
  for (let n = 2; db.medicines.some(m => m.code === code); n += 1)
    code = `${base}-${n}`;
  return code;
}

export function createMedicine(tx: Tx, input: MedicineInput): Medicine {
  const details = medicineDetails(tx, input);
  const medicine: Medicine = {
    // Seeded medicines use "med_n"; new ones get their own sequence.
    id: newId(tx, "mdn"),
    code: itemCode(tx.db, details.name, details.strength),
    ...details,
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.medicines.push(medicine);
  log(tx, {
    entityType: "pharmacy",
    entityId: medicine.id,
    action: "medicine_added",
    summary: `${medicine.name} ${medicine.strength} added to the formulary as ${medicine.code}`,
  });
  return medicine;
}

/** Edits an item; a new price applies to what is dispensed from now on. */
export function updateMedicine(tx: Tx, medicineId: ID, input: MedicineInput) {
  const medicine = must(tx.db.medicines, medicineId, "Medicine");
  Object.assign(medicine, medicineDetails(tx, input, medicine.id));
  touch(tx, medicine);
  log(tx, {
    entityType: "pharmacy",
    entityId: medicine.id,
    action: "medicine_updated",
    summary: `${medicine.name} ${medicine.strength} (${medicine.code}) updated`,
  });
  return medicine;
}

/** Only an item added by mistake — never stocked, prescribed or sold. */
export function deleteMedicine(tx: Tx, medicineId: ID) {
  const medicine = must(tx.db.medicines, medicineId, "Medicine");
  const used =
    tx.db.medicineBatches.some(b => b.medicineId === medicine.id) ||
    tx.db.prescriptionItems.some(i => i.medicineId === medicine.id) ||
    tx.db.pharmacyTransactions.some(t => t.medicineId === medicine.id);
  assert(
    !used,
    `${medicine.name} ${medicine.strength} has stock or prescription history, so it stays in the formulary.`
  );
  tx.db.medicines = tx.db.medicines.filter(m => m.id !== medicine.id);
  log(tx, {
    entityType: "pharmacy",
    entityId: medicine.id,
    action: "medicine_deleted",
    summary: `${medicine.name} ${medicine.strength} (${medicine.code}) removed from the formulary`,
  });
  return medicine;
}
