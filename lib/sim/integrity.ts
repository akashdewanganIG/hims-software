/**
 * Cross-module integrity checks — the "Functional Integrity Rules" of the
 * implementation brief, executable. Used by `npm run verify:sim`, the test
 * suite (after every operation), the database verifier and the in-app
 * simulation panel.
 *
 * Every lookup is indexed up front so a full check stays fast on the seeded
 * hospital (~100k rows).
 */
import { allInvoiceTotals } from "../domain/billing";
import { bedRestrictionReason, isInHouse } from "../domain/ipd";
import { activeAdministrators } from "../domain/admin";
import { LANDING_PAGES, isAction, isModule, resolveAccess } from "../rbac";
import type { Database, FileOwner, InvoiceStatus, TableName } from "./schema";

export interface IntegrityIssue {
  rule: string;
  detail: string;
}

type Ref = [
  table: TableName,
  field: string,
  target: TableName,
  optional?: boolean,
];

/**
 * Every id-valued column and the table it points at. The PostgreSQL schema
 * declares the same references as foreign keys (checked by the test suite).
 */
export const REFERENCES: Ref[] = [
  ["staff", "departmentId", "departments"],
  ["users", "staffId", "staff"],
  ["users", "roleId", "roles"],
  ["admissions", "billingClearedById", "staff", true],
  ["enquiries", "patientId", "patients", true],
  ["enquiries", "departmentId", "departments", true],
  ["enquiries", "preferredDoctorId", "staff", true],
  ["enquiries", "assignedToId", "staff"],
  ["enquiries", "referredById", "staff", true],
  ["enquiries", "appointmentId", "appointments", true],
  ["enquiryFollowUps", "enquiryId", "enquiries"],
  ["enquiryFollowUps", "byId", "staff"],
  ["appointments", "patientId", "patients"],
  ["appointments", "doctorId", "staff"],
  ["appointments", "departmentId", "departments"],
  ["appointments", "enquiryId", "enquiries", true],
  ["appointments", "encounterId", "encounters", true],
  ["encounters", "patientId", "patients"],
  ["encounters", "departmentId", "departments"],
  ["encounters", "doctorId", "staff"],
  ["encounters", "appointmentId", "appointments", true],
  ["encounters", "admissionId", "admissions", true],
  ["wards", "departmentId", "departments", true],
  ["rooms", "wardId", "wards"],
  ["beds", "roomId", "rooms"],
  ["beds", "admissionId", "admissions", true],
  ["admissions", "patientId", "patients"],
  ["admissions", "encounterId", "encounters"],
  ["admissions", "doctorId", "staff"],
  ["admissions", "departmentId", "departments"],
  ["admissions", "sourceEncounterId", "encounters", true],
  ["bedAssignments", "admissionId", "admissions"],
  ["bedAssignments", "bedId", "beds"],
  ["bedAssignments", "byId", "staff"],
  ["clinicalNotes", "patientId", "patients"],
  ["clinicalNotes", "encounterId", "encounters"],
  ["clinicalNotes", "admissionId", "admissions", true],
  ["clinicalNotes", "authorId", "staff"],
  ["careOrders", "admissionId", "admissions"],
  ["careOrders", "orderedById", "staff"],
  ["dischargeSummaries", "admissionId", "admissions"],
  ["dischargeSummaries", "patientId", "patients"],
  ["dischargeSummaries", "preparedById", "staff"],
  ["medicineBatches", "medicineId", "medicines"],
  ["prescriptions", "patientId", "patients"],
  ["prescriptions", "encounterId", "encounters"],
  ["prescriptions", "admissionId", "admissions", true],
  ["prescriptions", "prescriberId", "staff"],
  ["prescriptionItems", "prescriptionId", "prescriptions"],
  ["prescriptionItems", "medicineId", "medicines"],
  ["pharmacyTransactions", "medicineId", "medicines"],
  ["pharmacyTransactions", "batchId", "medicineBatches"],
  ["pharmacyTransactions", "prescriptionItemId", "prescriptionItems", true],
  ["pharmacyTransactions", "patientId", "patients", true],
  ["pharmacyTransactions", "byId", "staff"],
  ["labOrders", "patientId", "patients"],
  ["labOrders", "encounterId", "encounters"],
  ["labOrders", "admissionId", "admissions", true],
  ["labOrders", "orderedById", "staff"],
  ["labOrders", "collectedById", "staff", true],
  ["labOrders", "technicianId", "staff", true],
  ["labOrders", "verifiedById", "staff", true],
  ["labOrderItems", "labOrderId", "labOrders"],
  ["labOrderItems", "testId", "labTests"],
  ["labResults", "labOrderItemId", "labOrderItems"],
  ["labResults", "enteredById", "staff"],
  ["invoices", "patientId", "patients"],
  ["invoices", "encounterId", "encounters", true],
  ["invoices", "admissionId", "admissions", true],
  ["invoiceItems", "invoiceId", "invoices"],
  ["payments", "invoiceId", "invoices"],
  ["payments", "receivedById", "staff"],
  ["medicalRecords", "patientId", "patients"],
  ["medicalRecords", "encounterId", "encounters"],
  ["medicalRecords", "admissionId", "admissions", true],
  ["medicalRecords", "departmentId", "departments"],
  ["medicalRecords", "attendingDoctorId", "staff"],
  ["medicalRecords", "reviewedById", "staff", true],
  ["recordAccessLogs", "medicalRecordId", "medicalRecords"],
  ["recordAccessLogs", "byId", "staff"],
  ["documents", "patientId", "patients"],
  ["documents", "encounterId", "encounters", true],
  ["documents", "admissionId", "admissions", true],
  ["documents", "uploadedById", "staff"],
  ["files", "uploadedById", "staff"],
  ["complaints", "patientId", "patients", true],
  ["complaints", "encounterId", "encounters", true],
  ["complaints", "departmentId", "departments"],
  ["complaints", "assignedToId", "staff", true],
  ["complaints", "loggedById", "staff"],
  ["complaintNotes", "complaintId", "complaints"],
  ["complaintNotes", "byId", "staff"],
  ["feedback", "patientId", "patients", true],
  ["feedback", "encounterId", "encounters", true],
  ["feedback", "departmentId", "departments"],
  ["feedback", "doctorId", "staff", true],
  ["feedback", "followUpById", "staff", true],
  ["roster", "staffId", "staff"],
  ["roster", "shiftId", "shifts", true],
  ["roster", "departmentId", "departments"],
  ["activity", "actorId", "staff"],
  ["activity", "patientId", "patients", true],
];

/**
 * Values that identify a row on their own. PostgreSQL enforces the same as
 * unique constraints, so a duplicate here would also fail to persist.
 */
export const UNIQUE_KEYS: Array<[table: TableName, fields: string[]]> = [
  ["departments", ["code"]],
  ["staff", ["staffCode"]],
  ["staff", ["email"]],
  ["users", ["staffId"]],
  ["users", ["username"]],
  ["roles", ["name"]],
  ["patients", ["uhid"]],
  ["enquiries", ["code"]],
  ["appointments", ["code"]],
  ["appointments", ["encounterId"]],
  ["encounters", ["code"]],
  ["encounters", ["appointmentId"]],
  ["encounters", ["admissionId"]],
  ["wards", ["code"]],
  ["rooms", ["wardId", "number"]],
  ["beds", ["code"]],
  ["admissions", ["code"]],
  ["admissions", ["encounterId"]],
  ["dischargeSummaries", ["admissionId"]],
  ["medicines", ["code"]],
  ["medicineBatches", ["medicineId", "batchNumber"]],
  ["prescriptions", ["code"]],
  ["pharmacyTransactions", ["code"]],
  ["labTests", ["code"]],
  ["labOrders", ["code"]],
  ["labOrders", ["sampleId"]],
  ["labResults", ["labOrderItemId", "parameterId"]],
  ["invoices", ["code"]],
  ["payments", ["code"]],
  ["medicalRecords", ["code"]],
  ["medicalRecords", ["encounterId"]],
  ["complaints", ["code"]],
  ["feedback", ["code"]],
  ["shifts", ["code"]],
  ["roster", ["staffId", "date"]],
];

function expectedStatus(
  invoice: Database["invoices"][number],
  t: { total: number; netPaid: number; refunded: number }
): InvoiceStatus {
  if (invoice.status === "CANCELLED") return "CANCELLED";
  if (invoice.status === "DRAFT" && !invoice.finalisedAt) return "DRAFT";
  if (t.refunded > 0 && t.netPaid <= 0.005) return "REFUNDED";
  if (t.total <= 0.005 && t.netPaid >= t.total) return "PAID";
  if (t.netPaid <= 0.005) return "PENDING";
  if (t.netPaid < t.total - 0.005) return "PARTIALLY_PAID";
  return "PAID";
}

function groupBy<T, K>(rows: T[], key: (row: T) => K | undefined) {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === undefined) continue;
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map(r => [r.id, r]));
}

const TABLES = (db: Database) =>
  Object.keys(db).filter(k => k !== "meta") as TableName[];

export function checkIntegrity(db: Database): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const add = (rule: string, detail: string) => issues.push({ rule, detail });
  const rows = (table: TableName) =>
    db[table] as unknown as Array<Record<string, unknown> & { id: string }>;

  // 0. Row identity: ids and natural keys are unique.
  const ids = new Map<TableName, Set<string>>();
  for (const table of TABLES(db)) {
    const seen = new Set<string>();
    for (const row of rows(table)) {
      if (typeof row.id !== "string" || !row.id)
        add("Row without an id", `${table}`);
      else if (seen.has(row.id)) add("Duplicate id", `${table}.${row.id}`);
      seen.add(row.id);
    }
    ids.set(table, seen);
  }
  for (const [table, fields] of UNIQUE_KEYS) {
    const seen = new Set<string>();
    for (const row of rows(table)) {
      const values = fields.map(f => row[f]);
      if (values.some(v => v === undefined || v === null)) continue;
      const key = values.map(String).join("\u0000");
      if (seen.has(key))
        add(
          "Duplicate key",
          `${table}.${fields.join("+")} = ${values.join(" / ")}`
        );
      seen.add(key);
    }
  }

  // 1. Referential integrity.
  for (const [table, field, target, optional] of REFERENCES) {
    const targetIds = ids.get(target)!;
    for (const row of rows(table)) {
      const value = row[field];
      if (value === undefined || value === null) {
        if (!optional)
          add("Broken reference", `${table}.${field} missing on ${row.id}`);
        continue;
      }
      if (!targetIds.has(String(value)))
        add(
          "Broken reference",
          `${table}.${field} → ${String(value)} not in ${target}`
        );
    }
  }

  // Access: known permission keys, a reachable landing page, custom sets
  // only where they apply, and always an active Administrator.
  for (const role of db.roles) {
    const unknown = [
      ...role.modules.filter(m => !isModule(m)),
      ...role.actions.filter(a => !isAction(a)),
    ];
    if (unknown.length)
      add("Unknown permission", `role ${role.name}: ${unknown.join(", ")}`);
    const page = LANDING_PAGES.find(p => p.path === role.homePath);
    if (!page || !resolveAccess(role).modules.has(page.module))
      add("Unreachable landing page", `role ${role.name}: ${role.homePath}`);
  }
  for (const user of db.users) {
    const unknown = [
      ...user.modules.filter(m => !isModule(m)),
      ...user.actions.filter(a => !isAction(a)),
    ];
    if (unknown.length)
      add(
        "Unknown permission",
        `login ${user.username}: ${unknown.join(", ")}`
      );
    if (!user.customAccess && (user.modules.length || user.actions.length))
      add("Custom grants without custom access", `login ${user.username}`);
  }
  if (db.users.length && !activeAdministrators(db).length)
    add("No active Administrator", "Nobody can manage users and roles");

  // 2. Encounters ↔ appointments ↔ admissions point at each other.
  const encounters = byId(db.encounters);
  const appointments = byId(db.appointments);
  const admissions = byId(db.admissions);
  for (const apt of db.appointments) {
    if (!apt.encounterId) continue;
    const encounter = encounters.get(apt.encounterId);
    if (encounter && encounter.appointmentId !== apt.id)
      add("Links disagree", `${apt.code} → ${encounter.code}`);
  }
  for (const encounter of db.encounters) {
    if (encounter.type === "OPD" && encounter.admissionId)
      add("Links disagree", `${encounter.code} is OPD but has an admission`);
    if (encounter.type === "IPD") {
      const admission = encounter.admissionId
        ? admissions.get(encounter.admissionId)
        : undefined;
      if (!admission || admission.encounterId !== encounter.id)
        add("Links disagree", `${encounter.code} has no matching admission`);
    }
    if (encounter.appointmentId) {
      const apt = appointments.get(encounter.appointmentId);
      if (apt && apt.encounterId !== encounter.id)
        add("Links disagree", `${encounter.code} → ${apt.code}`);
    }
  }

  // 3. Beds ↔ admissions.
  const beds = byId(db.beds);
  const openAssignments = groupBy(
    db.bedAssignments.filter(a => !a.toAt),
    a => a.admissionId
  );
  const draftBills = new Set(
    db.invoices
      .filter(i => i.status === "DRAFT" && i.admissionId)
      .map(i => i.admissionId!)
  );
  const occupiedBy = groupBy(
    db.beds.filter(b => b.status === "OCCUPIED"),
    b => b.admissionId
  );
  const patients = byId(db.patients);
  const anchoredAt = new Date(db.meta.anchoredAt);
  const inHouseCount = new Map<string, number>();
  for (const admission of db.admissions) {
    const open = openAssignments.get(admission.id) ?? [];
    const encounter = encounters.get(admission.encounterId);
    if (isInHouse(admission)) {
      inHouseCount.set(
        admission.patientId,
        (inHouseCount.get(admission.patientId) ?? 0) + 1
      );
      if (open.length !== 1)
        add(
          "In-house patient without exactly one bed",
          `${admission.code} has ${open.length} open bed assignments`
        );
      const bed = open[0] ? beds.get(open[0].bedId) : undefined;
      if (
        bed &&
        (bed.status !== "OCCUPIED" || bed.admissionId !== admission.id)
      )
        add(
          "Bed not marked occupied",
          `${bed.code} for ${admission.code} is ${bed.status}`
        );
      const patient = patients.get(admission.patientId);
      const reason =
        bed && patient
          ? bedRestrictionReason(db, bed, patient, anchoredAt)
          : undefined;
      if (reason)
        add("Patient in an unsuitable ward", `${admission.code}: ${reason}`);
      if (encounter?.status !== "OPEN")
        add(
          "Contradictory status",
          `${admission.code} is in-house but its encounter is closed`
        );
    } else {
      if (open.length || occupiedBy.has(admission.id))
        add("Discharged patient still occupies a bed", `${admission.code}`);
      if (encounter?.status !== "CLOSED")
        add(
          "Contradictory status",
          `${admission.code} is discharged but its encounter is open`
        );
      if (draftBills.has(admission.id))
        add(
          "Contradictory status",
          `${admission.code} is discharged but its bill is still a draft`
        );
    }
    if (admission.status === "TRANSFER_PENDING") {
      const target = admission.pendingTransfer
        ? beds.get(admission.pendingTransfer.toBedId)
        : undefined;
      if (target?.status !== "RESERVED" || target.admissionId !== admission.id)
        add("Transfer target not held", `${admission.code}`);
    } else if (admission.pendingTransfer) {
      add(
        "Contradictory status",
        `${admission.code} is ${admission.status} but has a pending transfer`
      );
    }
  }
  for (const [patientId, count] of inHouseCount)
    if (count > 1) add("Patient admitted twice", patientId);
  for (const bed of db.beds) {
    if (bed.status === "OCCUPIED") {
      const admission = bed.admissionId
        ? admissions.get(bed.admissionId)
        : undefined;
      if (!admission || !isInHouse(admission))
        add("Occupied bed without an in-house admission", bed.code);
    } else if (bed.status !== "RESERVED" && bed.admissionId) {
      add(
        "Contradictory status",
        `${bed.code} is ${bed.status} but still points at an admission`
      );
    }
  }

  // 4. Pharmacy stock reconciles with its ledger; every dispense is billed.
  const txnsByBatch = groupBy(db.pharmacyTransactions, t => t.batchId);
  for (const batch of db.medicineBatches) {
    if (batch.quantityOnHand < 0) add("Negative stock", batch.batchNumber);
    let ledger = 0;
    for (const t of txnsByBatch.get(batch.id) ?? [])
      ledger +=
        t.type === "RECEIPT" || t.type === "RETURN" ? t.quantity : -t.quantity;
    if (ledger !== batch.quantityOnHand)
      add(
        "Stock does not match the ledger",
        `${batch.batchNumber}: ledger ${ledger}, on hand ${batch.quantityOnHand}`
      );
  }
  const txnsByItem = groupBy(
    db.pharmacyTransactions,
    t => t.prescriptionItemId
  );
  for (const item of db.prescriptionItems) {
    let out = 0;
    let back = 0;
    for (const t of txnsByItem.get(item.id) ?? []) {
      if (t.type === "DISPENSE") out += t.quantity;
      else if (t.type === "RETURN") back += t.quantity;
    }
    if (out !== item.quantityDispensed)
      add(
        "Dispensed quantity mismatch",
        `${item.id}: ${out} vs ${item.quantityDispensed}`
      );
    if (back !== item.quantityReturned)
      add("Returned quantity mismatch", `${item.id}`);
    if (item.quantityReturned > item.quantityDispensed)
      add("Returned more than dispensed", item.id);
    if (item.quantityDispensed > item.quantityPrescribed)
      add("Over-dispensed", item.id);
  }
  const billedSources = new Set(
    db.invoiceItems
      .filter(i => i.sourceId)
      .map(i => `${i.sourceType}:${i.sourceId}`)
  );
  for (const t of db.pharmacyTransactions) {
    if (
      (t.type === "DISPENSE" || t.type === "SALE") &&
      !billedSources.has(`PHARMACY_TXN:${t.id}`)
    )
      add("Dispense not billed", t.code);
    if (t.type === "SALE" && (!t.patientId || t.prescriptionItemId))
      add("Counter sale without a buyer or with a prescription", t.code);
    if (t.type === "RECEIPT" && (!t.supplier || !t.reference))
      add("Goods receipt without supplier invoice", t.code);
  }

  // 5. Labs: every order has tests, billing follows cancellation, reported
  // orders carry a result for every parameter of every test.
  const labTests = byId(db.labTests);
  const itemsByOrder = groupBy(db.labOrderItems, i => i.labOrderId);
  const resultsByItem = groupBy(db.labResults, r => r.labOrderItemId);
  const itemsById = byId(db.labOrderItems);
  for (const order of db.labOrders) {
    const items = itemsByOrder.get(order.id) ?? [];
    if (!items.length) add("Lab order without tests", order.code);
    for (const item of items) {
      const test = labTests.get(item.testId);
      const billed = billedSources.has(`LAB_ORDER_ITEM:${item.id}`);
      if (order.status !== "CANCELLED" && !billed)
        add("Lab test not billed", `${order.code} · ${test?.code}`);
      if (order.status === "CANCELLED" && billed)
        add("Cancelled lab test still billed", `${order.code} · ${test?.code}`);
      if (
        test &&
        (order.status === "VERIFIED" || order.status === "RESULT_READY")
      ) {
        const results = resultsByItem.get(item.id) ?? [];
        if (results.length !== test.parameters.length)
          add(
            "Reported lab without all results",
            `${order.code} · ${test.code}`
          );
      }
    }
    if (order.status === "VERIFIED" && !order.verifiedAt)
      add("Contradictory status", `${order.code} verified without a timestamp`);
  }
  for (const result of db.labResults) {
    const item = itemsById.get(result.labOrderItemId);
    const test = item ? labTests.get(item.testId) : undefined;
    if (test && !test.parameters.some(p => p.id === result.parameterId))
      add(
        "Result for an unknown parameter",
        `${result.id}: ${result.parameterId} is not part of ${test.code}`
      );
  }

  // 6. Billing: status follows the money; never refund more than collected.
  const totals = allInvoiceTotals(db);
  for (const invoice of db.invoices) {
    const t = totals.get(invoice.id)!;
    const expected = expectedStatus(invoice, t);
    if (expected !== invoice.status)
      add(
        "Invoice status disagrees with totals",
        `${invoice.code}: ${invoice.status}, expected ${expected}`
      );
    if (t.netPaid < -0.005) add("Refunded more than collected", invoice.code);
  }

  // 7. OPD and enquiry status combinations.
  for (const apt of db.appointments) {
    const encounter = apt.encounterId
      ? encounters.get(apt.encounterId)
      : undefined;
    if (
      (apt.status === "CHECKED_IN" || apt.status === "IN_CONSULTATION") &&
      encounter?.status !== "OPEN"
    )
      add(
        "Contradictory status",
        `${apt.code} ${apt.status} without an open visit`
      );
    if (apt.status === "COMPLETED" && encounter?.status !== "CLOSED")
      add("Contradictory status", `${apt.code} completed but visit open`);
    if (
      (apt.status === "SCHEDULED" ||
        apt.status === "CANCELLED" ||
        apt.status === "NO_SHOW") &&
      apt.encounterId
    )
      add("Contradictory status", `${apt.code} ${apt.status} but has a visit`);
  }
  for (const enq of db.enquiries) {
    if (enq.status !== "APPOINTMENT_SCHEDULED") continue;
    const apt = enq.appointmentId
      ? appointments.get(enq.appointmentId)
      : undefined;
    if (
      !apt ||
      !(
        apt.status === "SCHEDULED" ||
        apt.status === "CHECKED_IN" ||
        apt.status === "IN_CONSULTATION"
      )
    )
      add(
        "Contradictory status",
        `${enq.code} scheduled but appointment is ${apt?.status ?? "missing"}`
      );
  }

  // 8. Medical records exist for closed visits and every admission.
  const recorded = new Set(db.medicalRecords.map(r => r.encounterId));
  for (const encounter of db.encounters) {
    const needsRecord =
      encounter.type === "IPD" || encounter.status === "CLOSED";
    if (needsRecord && !recorded.has(encounter.id))
      add("Encounter missing its medical record", encounter.code);
  }

  // 9. Every uploaded file belongs to a row that exists; a person has one
  // photo and a document one scanned copy.
  const single = new Set<string>();
  for (const file of db.files) {
    if (!ids.get(FILE_OWNER_TABLE[file.ownerType])?.has(file.ownerId))
      add(
        "File without its owner",
        `${file.id}: ${file.ownerType} ${file.ownerId}`
      );
    if (file.ownerType !== "COMPLAINT") {
      const key = `${file.ownerType}:${file.ownerId}`;
      if (single.has(key)) add("More than one file for one owner", key);
      single.add(key);
    }
    if (!file.data.startsWith(`data:${file.mimeType};base64,`))
      add("File content does not match its type", file.id);
  }

  return issues;
}

/** The table each kind of file owner lives in. */
const FILE_OWNER_TABLE: Record<FileOwner, TableName> = {
  PATIENT_PHOTO: "patients",
  STAFF_PHOTO: "staff",
  DOCUMENT: "documents",
  COMPLAINT: "complaints",
};
