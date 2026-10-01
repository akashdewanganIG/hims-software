/**
 * The integrity checker must actually catch faults — otherwise every other
 * test that relies on it would pass vacuously. Each case corrupts a fresh
 * hospital in one specific way and expects the matching rule to fire.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isInHouse } from "../lib/domain/ipd";
import { checkIntegrity } from "../lib/sim/integrity";
import type { Database } from "../lib/sim/schema";
import { seededDatabase } from "./helpers";

const clean = seededDatabase();

test("a freshly seeded hospital passes every rule", () => {
  assert.deepEqual(checkIntegrity(clean), []);
});

const CASES: Array<[string, (db: Database) => void, RegExp]> = [
  [
    "duplicate row id",
    db => db.patients.push({ ...db.patients[0]! }),
    /Duplicate id/,
  ],
  [
    "duplicate natural key",
    db => {
      db.patients[1]!.uhid = db.patients[0]!.uhid;
    },
    /Duplicate key/,
  ],
  [
    "broken reference",
    db => {
      db.appointments[0]!.doctorId = "stf_missing";
    },
    /Broken reference/,
  ],
  [
    "login on a role that does not exist",
    db => {
      db.users[0]!.roleId = "rol_missing";
    },
    /Broken reference/,
  ],
  [
    "role granting an unknown permission",
    db => {
      db.roles.find(r => r.id === "NURSE")!.actions.push("pharmacy.fly");
    },
    /Unknown permission/,
  ],
  [
    "role landing on a page it cannot open",
    db => {
      db.roles.find(r => r.id === "LAB_TECHNICIAN")!.homePath = "/billing";
    },
    /Unreachable landing page/,
  ],
  [
    "no active Administrator left",
    db => {
      for (const u of db.users.filter(u => u.roleId === "ADMINISTRATOR"))
        u.status = "DISABLED";
    },
    /No active Administrator/,
  ],
  [
    "two logins with one login ID",
    db => {
      db.users[1]!.username = db.users[0]!.username;
    },
    /Duplicate/,
  ],
  [
    "in-house patient's bed marked free",
    db => {
      const admission = db.admissions.find(isInHouse)!;
      const open = db.bedAssignments.find(
        a => a.admissionId === admission.id && !a.toAt
      )!;
      const bed = db.beds.find(b => b.id === open.bedId)!;
      bed.status = "AVAILABLE";
      bed.admissionId = undefined;
    },
    /Bed not marked occupied/,
  ],
  [
    "discharged admission still holding a bed",
    db => {
      const admission = db.admissions.find(a => a.status === "DISCHARGED")!;
      const bed = db.beds.find(b => b.status === "AVAILABLE")!;
      bed.status = "OCCUPIED";
      bed.admissionId = admission.id;
    },
    /Discharged patient still occupies a bed|Occupied bed without an in-house admission/,
  ],
  [
    "stock that disagrees with its ledger",
    db => {
      db.medicineBatches[0]!.quantityOnHand += 1;
    },
    /Stock does not match the ledger/,
  ],
  [
    "dispense that was never billed",
    db => {
      const txn = db.pharmacyTransactions.find(t => t.type === "DISPENSE")!;
      db.invoiceItems = db.invoiceItems.filter(i => i.sourceId !== txn.id);
    },
    /Dispense not billed|Invoice status disagrees/,
  ],
  [
    "lab test that was never billed",
    db => {
      const item = db.labOrderItems.find(i =>
        db.labOrders.some(
          o => o.id === i.labOrderId && o.status !== "CANCELLED"
        )
      )!;
      db.invoiceItems = db.invoiceItems.filter(i => i.sourceId !== item.id);
    },
    /Lab test not billed/,
  ],
  [
    "reported lab missing a result",
    db => {
      const verified = db.labOrders.find(o => o.status === "VERIFIED")!;
      const item = db.labOrderItems.find(i => i.labOrderId === verified.id)!;
      const result = db.labResults.findIndex(r => r.labOrderItemId === item.id);
      db.labResults.splice(result, 1);
    },
    /Reported lab without all results/,
  ],
  [
    "result for a parameter the test does not have",
    db => {
      db.labResults[0]!.parameterId = "lp_nonexistent";
    },
    /unknown parameter|Duplicate key/,
  ],
  [
    "invoice status that ignores its money",
    db => {
      db.invoices.find(i => i.status === "PAID")!.status = "PENDING";
    },
    /Invoice status disagrees with totals/,
  ],
  [
    "refund larger than the payments",
    db => {
      const invoice = db.invoices.find(i => i.status === "PAID")!;
      db.payments.push({
        id: "pay_extra",
        code: "RFD-TEST",
        invoiceId: invoice.id,
        kind: "REFUND",
        amount: 10_000_000,
        method: "CASH",
        reference: "",
        receivedAt: new Date().toISOString(),
        receivedById: db.staff[0]!.id,
        note: "test",
      });
    },
    /Refunded more than collected/,
  ],
  [
    "completed appointment with an open visit",
    db => {
      const apt = db.appointments.find(a => a.status === "COMPLETED")!;
      db.encounters.find(e => e.id === apt.encounterId)!.status = "OPEN";
    },
    /completed but visit open/,
  ],
  [
    "closed visit without a medical record",
    db => {
      const encounter = db.encounters.find(
        e => e.status === "CLOSED" && e.type === "OPD"
      )!;
      db.medicalRecords = db.medicalRecords.filter(
        r => r.encounterId !== encounter.id
      );
      db.recordAccessLogs = db.recordAccessLogs.filter(l =>
        db.medicalRecords.some(r => r.id === l.medicalRecordId)
      );
    },
    /missing its medical record/,
  ],
  [
    "scheduled enquiry whose appointment is gone",
    db => {
      const enquiry = db.enquiries.find(e => e.status === "CONVERTED")!;
      enquiry.status = "APPOINTMENT_SCHEDULED";
    },
    /scheduled but appointment/,
  ],
  [
    "patient admitted twice",
    db => {
      const admission = db.admissions.find(isInHouse)!;
      const other = db.admissions.find(
        a => isInHouse(a) && a.patientId !== admission.patientId
      )!;
      other.patientId = admission.patientId;
    },
    /Patient admitted twice/,
  ],
  [
    "scanned copy of a document that is gone",
    db => {
      db.files[0]!.ownerId = "doc_missing";
    },
    /File without its owner/,
  ],
  [
    "two scanned copies of one document",
    db => {
      db.files.push({ ...db.files[0]!, id: "fil_copy" });
    },
    /More than one file for one owner/,
  ],
  [
    "file content of another type",
    db => {
      db.files[0]!.mimeType = "image/png";
    },
    /File content does not match its type/,
  ],
];

for (const [name, corrupt, rule] of CASES) {
  test(`catches: ${name}`, () => {
    const db = structuredClone(clean);
    corrupt(db);
    const issues = checkIntegrity(db);
    assert.ok(
      issues.some(i => rule.test(`${i.rule} ${i.detail}`)),
      `expected ${rule}, got: ${issues.map(i => i.rule).join(", ") || "no issues"}`
    );
  });
}
