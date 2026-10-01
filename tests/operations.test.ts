/**
 * Every operation the application offers, exercised through the same path
 * the screens use: happy paths across each module's workflow, the domain
 * rules that must refuse (and leave the data untouched), integrity after
 * each journey, and the final check that no operation went untested.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { invoiceTotals } from "../lib/domain/billing";
import { dischargeClearance } from "../lib/domain/ipd";
import { recordChecklist } from "../lib/domain/mrd";
import { stockOnHand } from "../lib/domain/pharmacy";
import { OPERATION_NAMES } from "../lib/ops/registry";
import { doctorSlotsView } from "../features/opd/views";
import type { ID, LabTest } from "../lib/sim/schema";
import { addDays, addDaysIso, startOfWeek, isoDate } from "../lib/sim/time";
import {
  Hospital,
  exercised,
  newPatient,
  pdfUpload,
  pngUpload,
} from "./helpers";

const consultation = (diagnosis?: string) => ({
  chiefComplaint: "Fever with body ache for 3 days",
  history: "No travel. Two family members with similar fever.",
  examination: "Temp 38.6°C, throat congested, chest clear.",
  diagnoses: diagnosis
    ? [{ description: diagnosis, type: "PRIMARY" as const }]
    : [],
  consultationNotes: "Likely viral fever. Rule out dengue.",
  advice: "Oral fluids, rest, paracetamol as needed.",
});

/** Plausible results for every parameter of the tests on an order. */
function resultsFor(
  h: Hospital,
  orderId: ID,
  pick?: (p: LabTest["parameters"][number]) => string | undefined
) {
  const values: Record<string, Record<string, string>> = {};
  for (const item of h.db.labOrderItems.filter(i => i.labOrderId === orderId)) {
    const test = h.db.labTests.find(t => t.id === item.testId)!;
    values[item.id] = Object.fromEntries(
      test.parameters.map(p => [
        p.id,
        pick?.(p) ??
          (p.options
            ? (p.refText ?? p.options[0]!)
            : String(
                p.refLow !== undefined && p.refHigh !== undefined
                  ? (p.refLow + p.refHigh) / 2
                  : 5
              )),
      ])
    );
  }
  return values;
}

test("patients: register, edit, duplicates, validation and permissions", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");

  const patient = h.run(
    desk,
    "patient.register",
    newPatient({
      firstName: "  Asha ",
      gender: "FEMALE",
      allergies: [" Penicillin ", "Penicillin"],
    })
  );
  assert.match(patient.uhid, /^HMS-26-\d{6}$/);
  assert.equal(patient.firstName, "Asha");
  assert.deepEqual(patient.allergies, ["Penicillin"]);

  h.refuse(
    desk,
    "patient.register",
    newPatient({
      firstName: "asha",
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth,
    }),
    { code: "RULE_VIOLATION", message: /already registered/ }
  );
  h.refuse(desk, "patient.register", newPatient({ phone: "12345" }), {
    code: "RULE_VIOLATION",
    message: /10-digit/,
  });
  h.refuse(
    desk,
    "patient.register",
    newPatient({ dateOfBirth: "2099-01-01" }),
    {
      message: /past/,
    }
  );
  h.refuse(
    desk,
    "patient.register",
    { ...newPatient(), gender: "UNKNOWN" } as never,
    { code: "INVALID_INPUT" }
  );
  h.refuse(h.login("PHARMACIST"), "patient.register", newPatient(), {
    code: "FORBIDDEN",
  });
  h.refuse(null, "patient.register", newPatient(), { code: "UNAUTHENTICATED" });

  const edited = h.run(h.login("MRD_STAFF"), "patient.update", {
    patientId: patient.id,
    patient: {
      ...newPatient(),
      firstName: "Asha",
      lastName: "Kulkarni",
      gender: "FEMALE",
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth,
      bloodGroup: "B+",
      allergies: ["Penicillin", "Sulfa"],
    },
  });
  assert.equal(edited.lastName, "Kulkarni");
  assert.equal(edited.bloodGroup, "B+");
  h.refuse(desk, "patient.update", {
    patientId: patient.id,
    patient: { ...newPatient(), dateOfBirth: "2099-01-01" },
  });

  // An edit cannot turn one patient into a copy of another.
  const other = h.run(desk, "patient.register", newPatient());
  h.refuse(
    desk,
    "patient.update",
    {
      patientId: other.id,
      patient: {
        ...newPatient(),
        firstName: "ASHA",
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth,
      },
    },
    { code: "RULE_VIOLATION", message: /already registered as/ }
  );

  // A registration made in error is deleted; its UHID is never reused.
  h.refuse(
    h.login("MRD_STAFF"),
    "patient.remove",
    { patientId: other.id },
    { code: "FORBIDDEN" }
  );
  const removed = h.run(desk, "patient.remove", { patientId: other.id });
  assert.ok(!h.db.patients.some(p => p.id === other.id));
  assert.ok(!h.db.activity.some(e => e.patientId === other.id));
  h.refuse(
    desk,
    "patient.remove",
    { patientId: other.id },
    { message: /Patient was not found/ }
  );
  const next = h.run(desk, "patient.register", newPatient());
  assert.ok(next.uhid > removed.uhid, "the UHID sequence moves on");
  h.assertIntact();
  h.assertShadowMatches();
});

test("OPD: walk-in → vitals → consultation → orders → close → pharmacy → lab → billing", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const nurse = h.login("NURSE");
  const tech = h.login("LAB_TECHNICIAN");
  const pharmacist = h.login("PHARMACIST");
  const cashier = h.login("BILLING_EXECUTIVE");
  const { doctor, userId: dr } = h.doctorOnDuty("GEN");

  const patient = h.run(
    desk,
    "patient.register",
    newPatient({ allergies: ["Penicillin"] })
  );
  const { appointment, encounter } = h.run(desk, "appointment.walkIn", {
    patientId: patient.id,
    doctorId: doctor.id,
    reason: "Fever for 3 days",
  });
  assert.equal(appointment.status, "CHECKED_IN");
  assert.ok(appointment.tokenNumber && appointment.tokenNumber > 0);
  const bill = h.db.invoices.find(i => i.encounterId === encounter.id)!;
  const lines = h.db.invoiceItems.filter(i => i.invoiceId === bill.id);
  assert.deepEqual(lines.map(l => l.category).sort(), [
    "CONSULTATION",
    "REGISTRATION",
  ]);
  assert.equal(bill.status, "PENDING");

  h.refuse(
    desk,
    "appointment.walkIn",
    {
      patientId: patient.id,
      doctorId: doctor.id,
      reason: "Again",
    },
    { message: /already has/ }
  );

  h.refuse(
    nurse,
    "opd.recordVitals",
    { encounterId: encounter.id, vitals: { pulse: 400 } },
    {
      message: /Pulse must be between/,
    }
  );
  h.run(nurse, "opd.recordVitals", {
    encounterId: encounter.id,
    vitals: {
      temperatureC: 38.6,
      pulse: 102,
      systolic: 124,
      diastolic: 82,
      respiratoryRate: 18,
      spo2: 97,
      weightKg: 68,
      heightCm: 170,
    },
  });
  h.refuse(
    nurse,
    "opd.startConsultation",
    { appointmentId: appointment.id },
    { code: "FORBIDDEN" }
  );
  h.refuse(
    dr,
    "opd.closeVisit",
    {
      encounterId: encounter.id,
      consultation: consultation("Viral fever"),
      disposition: "SENT_HOME",
    },
    { message: /Start the consultation/ }
  );

  h.run(dr, "opd.startConsultation", { appointmentId: appointment.id });
  h.run(dr, "opd.saveConsultation", {
    encounterId: encounter.id,
    consultation: consultation(),
  });

  const amox = h.medicine("AMX500");
  const pcm = h.medicine("PCM500");
  h.refuse(
    dr,
    "rx.create",
    {
      encounterId: encounter.id,
      items: [
        {
          medicineId: amox.id,
          dose: "1 capsule",
          frequency: "TDS",
          route: "ORAL",
          durationDays: 5,
        },
      ],
    },
    { message: /allergic to Penicillin/ }
  );
  const rx = h.run(dr, "rx.create", {
    encounterId: encounter.id,
    items: [
      {
        medicineId: pcm.id,
        dose: "1 tablet",
        frequency: "TDS",
        route: "ORAL",
        durationDays: 3,
      },
    ],
  });
  const rxItem = h.db.prescriptionItems.find(i => i.prescriptionId === rx.id)!;
  assert.equal(rxItem.quantityPrescribed, 9);

  const cbc = h.labTest("CBC");
  const ns1 = h.labTest("NS1");
  const order = h.run(dr, "lab.order", {
    encounterId: encounter.id,
    testIds: [cbc.id, ns1.id, cbc.id],
    priority: "URGENT",
    clinicalNotes: "Rule out dengue",
  });
  assert.equal(
    h.db.labOrderItems.filter(i => i.labOrderId === order.id).length,
    2
  );
  // An order placed by mistake is cancelled and its charges withdrawn.
  const extra = h.run(dr, "lab.order", {
    encounterId: encounter.id,
    testIds: [h.labTest("ESR").id],
    priority: "ROUTINE",
  });
  h.run(dr, "lab.cancel", { orderId: extra.id, reason: "Duplicate" });
  const extraItem = h.db.labOrderItems.find(i => i.labOrderId === extra.id)!;
  assert.ok(!h.db.invoiceItems.some(i => i.sourceId === extraItem.id));

  h.refuse(
    dr,
    "opd.closeVisit",
    {
      encounterId: encounter.id,
      consultation: consultation(),
      disposition: "SENT_HOME",
    },
    { message: /diagnosis/ }
  );
  h.refuse(
    dr,
    "opd.closeVisit",
    {
      encounterId: encounter.id,
      consultation: consultation("Viral fever"),
      disposition: "FOLLOW_UP",
    },
    { message: /follow-up date/ }
  );
  h.run(dr, "opd.closeVisit", {
    encounterId: encounter.id,
    consultation: consultation("Viral fever"),
    disposition: "SENT_HOME",
  });
  assert.equal(
    h.db.appointments.find(a => a.id === appointment.id)!.status,
    "COMPLETED"
  );
  assert.equal(
    h.db.encounters.find(e => e.id === encounter.id)!.status,
    "CLOSED"
  );
  const record = h.db.medicalRecords.find(r => r.encounterId === encounter.id)!;
  assert.equal(record.recordType, "OPD_CASE_SHEET");
  assert.equal(
    record.status,
    "PENDING_REVIEW",
    "checklist met → queued for review"
  );
  h.refuse(
    dr,
    "lab.order",
    { encounterId: encounter.id, testIds: [cbc.id], priority: "ROUTINE" },
    {
      message: /closed/,
    }
  );

  // Pharmacy: FEFO dispensing in two instalments, over-dispensing refused.
  const stockBefore = stockOnHand(h.db, pcm.id, h.today);
  h.refuse(
    pharmacist,
    "pharmacy.dispense",
    {
      prescriptionId: rx.id,
      lines: [{ itemId: rxItem.id, quantity: 10 }],
    },
    { message: /remain/ }
  );
  h.run(pharmacist, "pharmacy.dispense", {
    prescriptionId: rx.id,
    lines: [{ itemId: rxItem.id, quantity: 4 }],
  });
  assert.equal(
    h.db.prescriptions.find(p => p.id === rx.id)!.status,
    "PARTIALLY_DISPENSED"
  );
  h.run(pharmacist, "pharmacy.dispense", {
    prescriptionId: rx.id,
    lines: [{ itemId: rxItem.id, quantity: 5 }],
  });
  assert.equal(
    h.db.prescriptions.find(p => p.id === rx.id)!.status,
    "DISPENSED"
  );
  assert.equal(stockOnHand(h.db, pcm.id, h.today), stockBefore - 9);
  h.refuse(
    pharmacist,
    "pharmacy.dispense",
    { prescriptionId: rx.id, lines: [{ itemId: rxItem.id, quantity: 1 }] },
    {
      message: /dispensed/,
    }
  );
  h.run(pharmacist, "pharmacy.return", {
    itemId: rxItem.id,
    quantity: 2,
    reason: "Patient had stock at home",
  });
  assert.equal(stockOnHand(h.db, pcm.id, h.today), stockBefore - 7);
  h.refuse(
    pharmacist,
    "pharmacy.return",
    { itemId: rxItem.id, quantity: 8, reason: "x" },
    {
      message: /can be returned/,
    }
  );

  // Laboratory: strict stage order, complete results, validated values.
  h.refuse(
    tech,
    "lab.startProcessing",
    { orderId: order.id },
    { message: /cannot move/ }
  );
  h.run(nurse, "lab.requestSample", { orderId: order.id });
  const collected = h.run(tech, "lab.collectSample", { orderId: order.id });
  assert.match(collected.sampleId ?? "", /^S\d{6}-\d{4}$/);
  h.refuse(
    dr,
    "lab.cancel",
    { orderId: order.id, reason: "late" },
    { message: /collected/ }
  );
  h.run(tech, "lab.startProcessing", { orderId: order.id });
  const values = resultsFor(h, order.id, p =>
    p.name === "NS1 antigen" ? "Positive" : undefined
  );
  const [firstItem] = Object.keys(values);
  h.refuse(
    tech,
    "lab.enterResults",
    {
      orderId: order.id,
      values: { ...values, [firstItem!]: {} },
    },
    { message: /Enter a value/ }
  );
  h.refuse(
    tech,
    "lab.enterResults",
    {
      orderId: order.id,
      values: resultsFor(h, order.id, p => (p.options ? "Maybe" : undefined)),
    },
    { message: /must be one of/ }
  );
  h.refuse(
    tech,
    "lab.enterResults",
    {
      orderId: order.id,
      values: resultsFor(
        h,
        order.id,
        p => (p.options ? undefined : "high") as string
      ),
    },
    { message: /must be a number/ }
  );
  h.run(tech, "lab.enterResults", { orderId: order.id, values });
  const ns1Result = h.db.labResults.find(r => r.value === "Positive")!;
  assert.equal(ns1Result.flag, "ABNORMAL");
  const resultCount = h.db.labResults.length;
  h.run(tech, "lab.enterResults", {
    orderId: order.id,
    values: resultsFor(h, order.id),
  });
  assert.equal(
    h.db.labResults.length,
    resultCount,
    "corrections replace results"
  );
  h.refuse(
    h.login("RECEPTIONIST"),
    "lab.verify",
    { orderId: order.id },
    { code: "FORBIDDEN" }
  );
  h.run(tech, "lab.verify", { orderId: order.id });
  assert.equal(h.db.labOrders.find(o => o.id === order.id)!.status, "VERIFIED");

  // Billing: the visit's one bill carries consultation, lab and pharmacy.
  const totals = invoiceTotals(h.db, bill.id);
  assert.ok(totals.total > 0);
  const categories = new Set(
    h.db.invoiceItems.filter(i => i.invoiceId === bill.id).map(i => i.category)
  );
  for (const c of ["REGISTRATION", "CONSULTATION", "LAB", "PHARMACY"] as const)
    assert.ok(categories.has(c), c);
  h.refuse(
    cashier,
    "billing.collect",
    { invoiceId: bill.id, amount: totals.balance + 1, method: "UPI" },
    {
      message: /exceeds/,
    }
  );
  h.run(cashier, "billing.collect", {
    invoiceId: bill.id,
    amount: 100,
    method: "CASH",
  });
  assert.equal(
    h.db.invoices.find(i => i.id === bill.id)!.status,
    "PARTIALLY_PAID"
  );
  h.run(cashier, "billing.collect", {
    invoiceId: bill.id,
    amount: invoiceTotals(h.db, bill.id).balance,
    method: "UPI",
    reference: "UPI-4471",
  });
  assert.equal(h.db.invoices.find(i => i.id === bill.id)!.status, "PAID");
  h.refuse(
    cashier,
    "billing.refund",
    {
      invoiceId: bill.id,
      amount: totals.total + 500,
      method: "CASH",
      reason: "x",
    },
    {
      message: /cannot exceed/,
    }
  );
  h.refuse(
    desk,
    "billing.refund",
    { invoiceId: bill.id, amount: 10, method: "CASH", reason: "x" },
    {
      code: "FORBIDDEN",
    }
  );
  h.run(cashier, "billing.refund", {
    invoiceId: bill.id,
    amount: 50,
    method: "CASH",
    reason: "Goodwill",
  });
  assert.equal(
    h.db.invoices.find(i => i.id === bill.id)!.status,
    "PARTIALLY_PAID"
  );

  // MRD: review loop on the closed visit's case sheet.
  const mrd = h.login("MRD_STAFF");
  h.run(mrd, "mrd.logView", { recordId: record.id });
  h.run(mrd, "mrd.return", {
    recordId: record.id,
    note: "Consultant signature missing",
  });
  assert.equal(
    h.db.medicalRecords.find(r => r.id === record.id)!.status,
    "INCOMPLETE"
  );
  h.refuse(
    mrd,
    "mrd.review",
    { recordId: record.id },
    { message: /pending review/ }
  );
  h.run(mrd, "mrd.resubmit", { recordId: record.id });
  h.refuse(
    mrd,
    "mrd.archive",
    { recordId: record.id, location: "Rack A" },
    { message: /complete/ }
  );
  h.run(mrd, "mrd.review", { recordId: record.id, note: "OK" });
  h.run(mrd, "mrd.archive", {
    recordId: record.id,
    location: "Rack A · Shelf 2",
  });
  assert.equal(
    h.db.medicalRecords.find(r => r.id === record.id)!.status,
    "ARCHIVED"
  );
  h.refuse(mrd, "mrd.archive", { recordId: record.id, location: "Rack B" });
  const actions = h.db.recordAccessLogs
    .filter(l => l.medicalRecordId === record.id)
    .map(l => l.action);
  for (const a of ["SUBMITTED", "VIEWED", "RETURNED", "REVIEWED", "ARCHIVED"])
    assert.ok(actions.includes(a as never), a);

  h.assertIntact();
  h.assertShadowMatches();
});

test("consultation validity: a review within 7 days is free; later follow-ups pay half", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const scheduled = (staffId: string, days: number) =>
    h.db.roster.some(
      r =>
        r.staffId === staffId &&
        r.date === addDaysIso(h.today, days) &&
        r.status === "SCHEDULED"
    );
  const doctor = h.db.staff.find(
    s =>
      s.role === "DOCTOR" &&
      s.status === "ACTIVE" &&
      [0, 3, 10].every(d => scheduled(s.id, d))
  );
  assert.ok(doctor, "a doctor rostered today, in 3 and in 10 days");
  const fee = doctor.consultationFee ?? 500;
  const patient = h.run(desk, "patient.register", newPatient());
  const consultation = (appointmentId: string) =>
    h.db.invoiceItems.find(
      i => i.sourceType === "APPOINTMENT" && i.sourceId === appointmentId
    )!;

  const first = h.run(desk, "appointment.walkIn", {
    patientId: patient.id,
    doctorId: doctor.id,
    reason: "Fever and body ache",
  });
  assert.equal(consultation(first.appointment.id).unitPrice, fee);

  const book = (days: number) => {
    const slot = doctorSlotsView(h.db, h.now, {
      doctorId: doctor.id,
      date: addDaysIso(h.today, days),
    }).find(s => !s.taken && !s.past)!;
    assert.ok(slot, `a free slot in ${days} days`);
    const appointment = h.run(desk, "appointment.book", {
      patientId: patient.id,
      doctorId: doctor.id,
      scheduledAt: slot.iso,
      type: "FOLLOW_UP",
      source: "FOLLOW_UP",
      reason: "Review with reports",
    });
    return { appointment, at: new Date(slot.iso) };
  };
  const review = book(3);
  const later = book(10);
  const start = h.now;

  // Three days later: inside the validity of the paid visit — free.
  h.now = review.at;
  h.run(desk, "appointment.checkIn", { appointmentId: review.appointment.id });
  const free = consultation(review.appointment.id);
  assert.equal(free.unitPrice, 0);
  assert.match(free.description, /free within 7 days/);

  // Ten days after the paid visit (the free review does not extend it):
  // an ordinary follow-up at half the fee.
  h.now = later.at;
  h.run(desk, "appointment.checkIn", { appointmentId: later.appointment.id });
  assert.equal(
    consultation(later.appointment.id).unitPrice,
    Math.round(fee / 2)
  );
  h.now = start;
  h.assertIntact();
  h.assertShadowMatches();
});

test("appointments: booking rules, reschedule, no-show, cancel, check-in day", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const { doctor } = h.doctorOnDuty();
  const a = h.run(desk, "patient.register", newPatient());
  const b = h.run(desk, "patient.register", newPatient());

  const later = h.at(15, 7).toISOString();
  const booked = h.run(desk, "appointment.book", {
    patientId: a.id,
    doctorId: doctor.id,
    scheduledAt: later,
    type: "NEW",
    source: "PHONE",
    reason: "Knee pain",
  });
  assert.equal(booked.status, "SCHEDULED");
  h.refuse(
    desk,
    "appointment.book",
    {
      patientId: a.id,
      doctorId: doctor.id,
      scheduledAt: h.at(16, 11).toISOString(),
      type: "NEW",
      source: "PHONE",
      reason: "Again",
    },
    { message: /already has/ }
  );
  h.refuse(
    desk,
    "appointment.book",
    {
      patientId: b.id,
      doctorId: doctor.id,
      scheduledAt: later,
      type: "NEW",
      source: "PHONE",
      reason: "Clash",
    },
    { message: /slot is already booked/ }
  );
  h.refuse(
    desk,
    "appointment.book",
    {
      patientId: b.id,
      doctorId: doctor.id,
      scheduledAt: h.at(8, 0, -1).toISOString(),
      type: "NEW",
      source: "PHONE",
      reason: "Past",
    },
    { message: /past/ }
  );
  h.refuse(
    desk,
    "appointment.book",
    {
      patientId: b.id,
      doctorId: doctor.id,
      scheduledAt: later,
      type: "NEW",
      source: "WALK_IN",
      reason: "Sneaky",
    } as never,
    { code: "INVALID_INPUT" }
  );

  const moved = h.run(desk, "appointment.reschedule", {
    appointmentId: booked.id,
    scheduledAt: h.at(15, 37).toISOString(),
  });
  assert.equal(moved.rescheduledFrom, later);
  h.refuse(
    desk,
    "appointment.reschedule",
    { appointmentId: booked.id, scheduledAt: h.at(9, 0, -1).toISOString() },
    {
      message: /future/,
    }
  );
  h.refuse(
    desk,
    "appointment.noShow",
    { appointmentId: booked.id },
    { message: /not passed/ }
  );

  // B books a slot a few minutes ahead, never arrives.
  const soon = h.run(desk, "appointment.book", {
    patientId: b.id,
    doctorId: doctor.id,
    scheduledAt: h.at(10, 41).toISOString(),
    type: "FOLLOW_UP",
    source: "FOLLOW_UP",
    reason: "Review",
  });
  h.advance(45);
  h.run(desk, "appointment.noShow", { appointmentId: soon.id });
  h.refuse(
    desk,
    "appointment.checkIn",
    { appointmentId: soon.id },
    { message: /not awaiting/ }
  );

  // Tomorrow's booking cannot be checked in today; then it is cancelled.
  const { doctor: tomorrowDoc } = h.doctorOnDuty(undefined, 1);
  const tomorrow = h.run(desk, "appointment.book", {
    patientId: b.id,
    doctorId: tomorrowDoc.id,
    scheduledAt: h.at(11, 13, 1).toISOString(),
    type: "NEW",
    source: "ONLINE",
    reason: "Skin rash",
  });
  h.refuse(
    desk,
    "appointment.checkIn",
    { appointmentId: tomorrow.id },
    { message: /day of their appointment/ }
  );
  h.refuse(
    desk,
    "appointment.cancel",
    { appointmentId: tomorrow.id, reason: "  " },
    { message: /reason is required/ }
  );
  h.run(desk, "appointment.cancel", {
    appointmentId: tomorrow.id,
    reason: "Patient travelling",
  });

  const encounter = h.run(desk, "appointment.checkIn", {
    appointmentId: booked.id,
  });
  assert.equal(encounter.type, "OPD");
  const followUpFee = h.db.invoiceItems.find(i => i.sourceId === booked.id)!;
  assert.equal(followUpFee.category, "CONSULTATION");
  h.assertIntact();
  h.assertShadowMatches();
});

test("enquiry: follow-ups, conversion (with registration), reschedule, cancel and close", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const deskStaff = h.staffOf(desk);
  const { doctor, userId: dr } = h.doctorOnDuty(undefined, 1);

  const enquiry = h.run(desk, "enquiry.create", {
    type: "EXTERNAL",
    prospectName: "Ravi Deshmukh",
    phone: "98220 11223",
    source: "PHONE",
    reason: "Recurring headaches",
    assignedToId: deskStaff.id,
    followUpDate: addDaysIso(h.today, 1),
  });
  assert.equal(enquiry.status, "FOLLOW_UP_REQUIRED");
  h.refuse(
    desk,
    "enquiry.create",
    {
      type: "INTERNAL",
      prospectName: "X",
      phone: "9822011223",
      source: "DEPARTMENT_REFERRAL",
      reason: "Referral",
      assignedToId: deskStaff.id,
    },
    { message: /referring staff member/ }
  );
  h.refuse(
    desk,
    "enquiry.create",
    {
      type: "EXTERNAL",
      prospectName: "X",
      phone: "9822011223",
      source: "PHONE",
      reason: "Old",
      assignedToId: deskStaff.id,
      followUpDate: addDaysIso(h.today, -2),
    },
    { message: /past/ }
  );
  h.refuse(
    h.login("NURSE"),
    "enquiry.create",
    {
      type: "EXTERNAL",
      prospectName: "X",
      phone: "9822011223",
      source: "PHONE",
      reason: "x",
      assignedToId: deskStaff.id,
    },
    { code: "FORBIDDEN" }
  );

  h.run(desk, "enquiry.followUp", {
    enquiryId: enquiry.id,
    channel: "CALL",
    note: "Wants a neurologist",
    nextFollowUpDate: addDaysIso(h.today, 2),
  });
  h.refuse(
    desk,
    "enquiry.followUp",
    {
      enquiryId: enquiry.id,
      channel: "CALL",
      note: "x",
      nextFollowUpDate: addDaysIso(h.today, -1),
    },
    { message: /past/ }
  );
  h.run(desk, "enquiry.update", {
    enquiryId: enquiry.id,
    reason: "Recurring headaches, 2 months",
    assignedToId: deskStaff.id,
    departmentId: doctor.departmentId,
    notes: "Prefers mornings",
  });
  h.run(desk, "enquiry.reschedule", {
    enquiryId: enquiry.id,
    followUpDate: addDaysIso(h.today, 3),
  });

  const slot = h.at(10, 23, 1).toISOString();
  h.refuse(
    desk,
    "enquiry.convert",
    {
      enquiryId: enquiry.id,
      doctorId: doctor.id,
      scheduledAt: slot,
      type: "NEW",
    },
    { message: /register the enquirer/ }
  );
  const appointment = h.run(desk, "enquiry.convert", {
    enquiryId: enquiry.id,
    doctorId: doctor.id,
    scheduledAt: slot,
    type: "NEW",
    newPatient: newPatient({
      firstName: "Ravi",
      lastName: "Deshmukh",
      phone: "9822011223",
    }),
  });
  let current = h.db.enquiries.find(e => e.id === enquiry.id)!;
  assert.equal(current.status, "APPOINTMENT_SCHEDULED");
  assert.equal(current.appointmentId, appointment.id);
  assert.ok(current.patientId);

  h.run(desk, "enquiry.reschedule", {
    enquiryId: enquiry.id,
    scheduledAt: h.at(10, 53, 1).toISOString(),
  });
  // The booked appointment falls through: the enquiry goes back to follow-up.
  h.run(desk, "appointment.cancel", {
    appointmentId: appointment.id,
    reason: "Clash at work",
  });
  current = h.db.enquiries.find(e => e.id === enquiry.id)!;
  assert.equal(current.status, "FOLLOW_UP_REQUIRED");
  const second = h.run(desk, "enquiry.convert", {
    enquiryId: enquiry.id,
    doctorId: doctor.id,
    scheduledAt: h.at(11, 29, 1).toISOString(),
    type: "NEW",
  });

  // Next day: the visit happens and the enquiry converts.
  h.now = h.at(11, 35, 1);
  h.run(desk, "appointment.checkIn", { appointmentId: second.id });
  h.run(dr, "opd.startConsultation", { appointmentId: second.id });
  h.run(dr, "opd.closeVisit", {
    encounterId: h.db.appointments.find(a => a.id === second.id)!.encounterId!,
    consultation: consultation("Tension-type headache"),
    disposition: "SENT_HOME",
  });
  assert.equal(
    h.db.enquiries.find(e => e.id === enquiry.id)!.status,
    "CONVERTED"
  );
  h.refuse(
    desk,
    "enquiry.cancel",
    { enquiryId: enquiry.id, reason: "x" },
    { message: /closed/ }
  );

  const other = h.run(desk, "enquiry.create", {
    type: "EXTERNAL",
    prospectName: "Meena Joshi",
    phone: "9890012345",
    source: "WEBSITE",
    reason: "Health check packages",
    assignedToId: deskStaff.id,
  });
  h.run(desk, "enquiry.close", {
    enquiryId: other.id,
    note: "Sent package brochure",
  });
  const third = h.run(desk, "enquiry.create", {
    type: "EXTERNAL",
    prospectName: "Omkar Pawar",
    phone: "9890012346",
    source: "WALK_IN",
    reason: "Physiotherapy",
    assignedToId: deskStaff.id,
  });
  h.run(desk, "enquiry.cancel", {
    enquiryId: third.id,
    reason: "Went elsewhere",
  });
  h.assertIntact();
  h.assertShadowMatches();
});

test("IPD: admit → notes → orders → transfer → discharge (with refusals) → MRD", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const nurse = h.login("NURSE");
  const pharmacist = h.login("PHARMACIST");
  const cashier = h.login("BILLING_EXECUTIVE");
  const mrd = h.login("MRD_STAFF");
  const { doctor, userId: dr } = h.doctorOnDuty();
  const patient = h.run(
    desk,
    "patient.register",
    newPatient({ gender: "MALE" })
  );
  const other = h.run(
    desk,
    "patient.register",
    newPatient({ gender: "FEMALE" })
  );

  const femaleBed = h.freeBedFor("FEMALE", "GWF");
  h.refuse(
    dr,
    "ipd.admit",
    {
      patientId: patient.id,
      doctorId: doctor.id,
      bedId: femaleBed.id,
      reason: "Pneumonia",
      provisionalDiagnosis: "CAP",
      source: "DIRECT",
    },
    { message: /female patients only/ }
  );
  const bed = h.freeBedFor("MALE", "GWM");
  h.refuse(
    dr,
    "ipd.admit",
    {
      patientId: patient.id,
      doctorId: doctor.id,
      bedId: bed.id,
      reason: "Pneumonia",
      provisionalDiagnosis: "CAP",
      source: "DIRECT",
      expectedDischargeDate: addDaysIso(h.today, -1),
    },
    { message: /past/ }
  );
  const admission = h.run(dr, "ipd.admit", {
    patientId: patient.id,
    doctorId: doctor.id,
    bedId: bed.id,
    reason: "Fever with breathlessness",
    provisionalDiagnosis: "Community-acquired pneumonia",
    source: "DIRECT",
    expectedDischargeDate: addDaysIso(h.today, 4),
  });
  assert.equal(admission.status, "ADMITTED");
  assert.equal(h.db.beds.find(b => b.id === bed.id)!.status, "OCCUPIED");
  const runningBill = h.db.invoices.find(i => i.admissionId === admission.id)!;
  assert.equal(runningBill.status, "DRAFT");
  h.refuse(
    dr,
    "ipd.admit",
    {
      patientId: patient.id,
      doctorId: doctor.id,
      bedId: h.freeBedFor("MALE").id,
      reason: "x",
      provisionalDiagnosis: "x",
      source: "DIRECT",
    },
    { message: /already admitted/ }
  );
  h.refuse(
    dr,
    "ipd.admit",
    {
      patientId: other.id,
      doctorId: doctor.id,
      bedId: bed.id,
      reason: "x",
      provisionalDiagnosis: "x",
      source: "DIRECT",
    },
    { message: /occupied/ }
  );

  h.run(dr, "ipd.addNote", {
    admissionId: admission.id,
    type: "ADMISSION",
    text: "Admitted with CAP.",
  });
  assert.equal(
    h.db.admissions.find(a => a.id === admission.id)!.status,
    "ADMITTED"
  );
  const visitsBefore = h.db.invoiceItems.filter(
    i => i.invoiceId === runningBill.id && i.category === "CONSULTATION"
  ).length;
  h.run(dr, "ipd.addNote", {
    admissionId: admission.id,
    type: "PROGRESS",
    text: "Afebrile, SpO2 95%.",
  });
  h.run(dr, "ipd.addNote", {
    admissionId: admission.id,
    type: "PROGRESS",
    text: "Evening round.",
  });
  const visitsAfter = h.db.invoiceItems.filter(
    i => i.invoiceId === runningBill.id && i.category === "CONSULTATION"
  ).length;
  assert.equal(
    visitsAfter,
    visitsBefore + 1,
    "one consultant visit billed per doctor per day"
  );
  assert.equal(
    h.db.admissions.find(a => a.id === admission.id)!.status,
    "ACTIVE"
  );
  h.run(nurse, "ipd.addNote", {
    admissionId: admission.id,
    type: "NURSING",
    text: "IV line patent.",
  });
  h.refuse(
    nurse,
    "ipd.addCareOrder",
    { admissionId: admission.id, type: "DIET", instruction: "Soft diet" },
    {
      code: "FORBIDDEN",
    }
  );
  const careOrder = h.run(dr, "ipd.addCareOrder", {
    admissionId: admission.id,
    type: "MONITORING",
    instruction: "Vitals 4-hourly",
  });
  h.run(dr, "ipd.endCareOrder", { orderId: careOrder.id, status: "COMPLETED" });
  h.refuse(
    dr,
    "ipd.endCareOrder",
    { orderId: careOrder.id, status: "DISCONTINUED" },
    { message: /no longer active/ }
  );
  h.run(dr, "ipd.addCareOrder", {
    admissionId: admission.id,
    type: "DIET",
    instruction: "Soft diet",
  });

  const ivRx = h.run(dr, "rx.create", {
    encounterId: admission.encounterId,
    items: [
      {
        medicineId: h.medicine("NS500").id,
        dose: "500 ml",
        frequency: "BD",
        route: "IV",
        durationDays: 2,
      },
      {
        medicineId: h.medicine("PAN40").id,
        dose: "1 tablet",
        frequency: "OD",
        route: "ORAL",
        durationDays: 5,
      },
    ],
  });
  const ivItems = h.db.prescriptionItems.filter(
    i => i.prescriptionId === ivRx.id
  );
  h.run(pharmacist, "pharmacy.dispense", {
    prescriptionId: ivRx.id,
    lines: [
      { itemId: ivItems[0]!.id, quantity: 2 },
      { itemId: ivItems[1]!.id, quantity: 0 },
    ],
  });
  const labOrder = h.run(dr, "lab.order", {
    encounterId: admission.encounterId,
    testIds: [h.labTest("CBC").id, h.labTest("CRP").id],
    priority: "STAT",
  });
  assert.ok(
    h.db.invoiceItems.some(
      i => i.invoiceId === runningBill.id && i.category === "LAB"
    )
  );
  h.run(cashier, "billing.collect", {
    invoiceId: runningBill.id,
    amount: 5000,
    method: "CARD",
  });

  // Transfer: requested, cancelled, requested again and completed.
  h.refuse(
    nurse,
    "ipd.requestTransfer",
    { admissionId: admission.id, toBedId: femaleBed.id, reason: "x" },
    {
      message: /female patients only/,
    }
  );
  const target = h.freeBedFor("MALE");
  h.run(nurse, "ipd.requestTransfer", {
    admissionId: admission.id,
    toBedId: target.id,
    reason: "Requested private room",
  });
  assert.equal(h.db.beds.find(b => b.id === target.id)!.status, "RESERVED");
  h.refuse(
    nurse,
    "beds.setHousekeeping",
    { bedId: target.id, status: "AVAILABLE" },
    { message: /pending transfer/ }
  );
  h.refuse(
    dr,
    "ipd.initiateDischarge",
    { admissionId: admission.id },
    { message: /pending transfer/ }
  );
  h.run(nurse, "ipd.cancelTransfer", { admissionId: admission.id });
  assert.equal(h.db.beds.find(b => b.id === target.id)!.status, "AVAILABLE");
  h.run(nurse, "ipd.requestTransfer", {
    admissionId: admission.id,
    toBedId: target.id,
    reason: "Private room",
  });
  h.advance(24 * 60);
  h.run(nurse, "ipd.completeTransfer", { admissionId: admission.id });
  assert.equal(h.db.beds.find(b => b.id === bed.id)!.status, "CLEANING");
  assert.equal(h.db.beds.find(b => b.id === target.id)!.status, "OCCUPIED");
  const roomCharges = h.db.invoiceItems.filter(
    i =>
      i.invoiceId === runningBill.id &&
      (i.category === "ROOM" || i.category === "NURSING")
  );
  assert.equal(
    roomCharges.length,
    2,
    "old bed's room and nursing charges posted"
  );

  // Discharge: summary must be final; can be reverted.
  h.run(dr, "ipd.initiateDischarge", { admissionId: admission.id });
  h.refuse(
    dr,
    "lab.order",
    {
      encounterId: admission.encounterId,
      testIds: [h.labTest("ESR").id],
      priority: "ROUTINE",
    },
    {
      message: /pending discharge/,
    }
  );
  h.run(dr, "rx.create", {
    encounterId: admission.encounterId,
    isDischargeMedication: true,
    items: [
      {
        medicineId: h.medicine("AZI500").id,
        dose: "1 tablet",
        frequency: "OD",
        route: "ORAL",
        durationDays: 3,
      },
    ],
  });
  h.refuse(
    dr,
    "ipd.discharge",
    { admissionId: admission.id },
    { message: /Finalise the discharge summary/ }
  );
  const summary = {
    finalDiagnosis: "Community-acquired pneumonia",
    courseInHospital: "Treated with IV fluids and antibiotics; improved.",
    proceduresDone: "",
    conditionAtDischarge: "Stable",
    dischargeMedications: "Azithromycin 500 mg OD × 3 days",
    followUpInstructions: "Review in OPD after 1 week",
    followUpDate: addDaysIso(h.today, 7),
  };
  h.refuse(
    dr,
    "ipd.saveDischargeSummary",
    {
      admissionId: admission.id,
      summary: { ...summary, courseInHospital: " " },
      finalise: true,
    },
    { message: /Course in hospital is required/ }
  );
  h.run(dr, "ipd.saveDischargeSummary", {
    admissionId: admission.id,
    summary,
    finalise: true,
  });
  // Clearance approved with dues is withdrawn when the discharge is reverted.
  h.run(cashier, "ipd.clearBilling", {
    admissionId: admission.id,
    note: "Approved by the medical superintendent",
  });
  h.run(dr, "ipd.revertDischarge", { admissionId: admission.id });
  assert.equal(
    h.db.dischargeSummaries.find(s => s.admissionId === admission.id)!.status,
    "DRAFT"
  );
  assert.equal(
    h.db.admissions.find(a => a.id === admission.id)!.billingClearedAt,
    undefined,
    "a reverted discharge needs clearing again"
  );
  h.run(dr, "ipd.initiateDischarge", { admissionId: admission.id });
  h.run(dr, "ipd.saveDischargeSummary", {
    admissionId: admission.id,
    summary,
    finalise: false,
  });
  h.run(dr, "ipd.saveDischargeSummary", {
    admissionId: admission.id,
    summary,
    finalise: true,
  });

  // Financial clearance: the billing desk settles the final bill (today's
  // room and nursing included) before the ward may discharge.
  h.refuse(
    dr,
    "ipd.discharge",
    { admissionId: admission.id },
    { message: /Billing has not cleared/ }
  );
  h.refuse(
    dr,
    "ipd.clearBilling",
    { admissionId: admission.id },
    { code: "FORBIDDEN" }
  );
  const finalDue = dischargeClearance(
    h.db,
    h.db.admissions.find(a => a.id === admission.id)!,
    new Date(h.now)
  ).balance;
  assert.ok(finalDue > 0, "room, nursing and medicines are due");
  h.refuse(
    cashier,
    "ipd.clearBilling",
    { admissionId: admission.id },
    { message: /still due/ }
  );
  h.run(cashier, "billing.collect", {
    invoiceId: runningBill.id,
    amount: finalDue,
    method: "UPI",
    reference: "Final settlement",
  });
  h.run(cashier, "ipd.clearBilling", { admissionId: admission.id });
  h.refuse(
    cashier,
    "ipd.clearBilling",
    { admissionId: admission.id },
    { message: /already cleared/ }
  );
  h.run(dr, "ipd.discharge", { admissionId: admission.id });

  const done = h.db.admissions.find(a => a.id === admission.id)!;
  assert.ok(done.billingClearedAt && !done.clearanceNote, "cleared, no dues");
  assert.equal(done.status, "DISCHARGED");
  assert.equal(h.db.beds.find(b => b.id === target.id)!.status, "CLEANING");
  assert.equal(
    h.db.encounters.find(e => e.id === admission.encounterId)!.status,
    "CLOSED"
  );
  const finalBill = h.db.invoices.find(i => i.id === runningBill.id)!;
  assert.equal(finalBill.status, "PAID", "settled at clearance, to the rupee");
  assert.equal(
    h.db.prescriptions.find(p => p.id === ivRx.id)!.status,
    "DISPENSED",
    "undispensed inpatient lines stopped"
  );
  assert.ok(
    h.db.careOrders
      .filter(o => o.admissionId === admission.id)
      .every(o => o.status !== "ACTIVE")
  );
  h.refuse(
    nurse,
    "ipd.addNote",
    { admissionId: admission.id, type: "NURSING", text: "x" },
    { message: /discharged/ }
  );
  h.run(nurse, "beds.setHousekeeping", {
    bedId: target.id,
    status: "AVAILABLE",
  });

  // Lab results still arrive after discharge.
  const tech = h.login("LAB_TECHNICIAN");
  h.run(tech, "lab.collectSample", { orderId: labOrder.id });
  h.run(tech, "lab.startProcessing", { orderId: labOrder.id });
  h.run(tech, "lab.enterResults", {
    orderId: labOrder.id,
    values: resultsFor(h, labOrder.id),
  });
  h.run(tech, "lab.verify", { orderId: labOrder.id });

  // MRD: the IPD case file completes once the consent form is on file.
  const record = h.db.medicalRecords.find(r => r.admissionId === admission.id)!;
  assert.equal(record.status, "INCOMPLETE");
  assert.deepEqual(
    recordChecklist(h.db, record)
      .filter(c => !c.done)
      .map(c => c.key),
    ["consent"]
  );
  h.refuse(
    pharmacist,
    "document.add",
    {
      patientId: patient.id,
      admissionId: admission.id,
      title: "Consent",
      kind: "CONSENT_FORM",
      file: pdfUpload("consent.pdf"),
    },
    { code: "FORBIDDEN" }
  );
  h.run(desk, "document.add", {
    patientId: patient.id,
    admissionId: admission.id,
    title: "General consent",
    kind: "CONSENT_FORM",
    file: pdfUpload("consent.pdf"),
  });
  assert.equal(
    h.db.medicalRecords.find(r => r.id === record.id)!.status,
    "PENDING_REVIEW"
  );
  h.run(mrd, "mrd.review", { recordId: record.id });
  h.run(mrd, "mrd.archive", { recordId: record.id, location: "IPD Rack 3" });

  // Settle the final bill: collect what is owed, or refund excess deposit.
  const due = invoiceTotals(h.db, finalBill.id);
  if (due.balance > 0)
    h.run(cashier, "billing.collect", {
      invoiceId: finalBill.id,
      amount: due.balance,
      method: "NET_BANKING",
    });
  else if (due.refundDue > 0)
    h.run(cashier, "billing.refund", {
      invoiceId: finalBill.id,
      amount: due.refundDue,
      method: "NET_BANKING",
      reason: "Excess advance deposit",
    });
  const settled = invoiceTotals(h.db, finalBill.id);
  assert.equal(settled.balance, 0);
  assert.equal(settled.refundDue, 0);
  assert.equal(h.db.invoices.find(i => i.id === finalBill.id)!.status, "PAID");
  h.assertIntact();
  h.assertShadowMatches();
});

test("billing desk: manual charges, discounts, cancellation", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const cashier = h.login("BILLING_EXECUTIVE");
  const { doctor } = h.doctorOnDuty();
  const patient = h.run(desk, "patient.register", newPatient());
  const { encounter } = h.run(desk, "appointment.walkIn", {
    patientId: patient.id,
    doctorId: doctor.id,
    reason: "Wound",
  });
  const bill = h.db.invoices.find(i => i.encounterId === encounter.id)!;

  h.refuse(
    desk,
    "billing.addCharge",
    {
      invoiceId: bill.id,
      category: "PROCEDURE",
      description: "Dressing",
      quantity: 1,
      unitPrice: 200,
    },
    { code: "FORBIDDEN" }
  );
  h.refuse(
    cashier,
    "billing.addCharge",
    {
      invoiceId: bill.id,
      category: "PROCEDURE",
      description: "Dressing",
      quantity: 1.5,
      unitPrice: 200,
    },
    { code: "INVALID_INPUT" }
  );
  const charge = h.run(cashier, "billing.addCharge", {
    invoiceId: bill.id,
    category: "PROCEDURE",
    description: "Wound dressing",
    quantity: 2,
    unitPrice: 200,
  });
  h.refuse(
    cashier,
    "billing.setDiscount",
    { itemId: charge.id, discount: 401 },
    { message: /between zero/ }
  );
  h.run(cashier, "billing.setDiscount", { itemId: charge.id, discount: 50 });
  assert.equal(invoiceTotals(h.db, bill.id).discount, 50);

  h.run(cashier, "billing.collect", {
    invoiceId: bill.id,
    amount: 100,
    method: "CASH",
  });
  h.refuse(
    cashier,
    "billing.cancel",
    { invoiceId: bill.id, reason: "Duplicate" },
    { message: /Refund all collected/ }
  );
  h.run(cashier, "billing.refund", {
    invoiceId: bill.id,
    amount: 100,
    method: "CASH",
    reason: "Bill raised in error",
  });
  assert.equal(h.db.invoices.find(i => i.id === bill.id)!.status, "REFUNDED");
  h.run(cashier, "billing.cancel", {
    invoiceId: bill.id,
    reason: "Raised in error",
  });
  assert.equal(h.db.invoices.find(i => i.id === bill.id)!.status, "CANCELLED");
  h.refuse(
    cashier,
    "billing.addCharge",
    {
      invoiceId: bill.id,
      category: "OTHER",
      description: "x",
      quantity: 1,
      unitPrice: 1,
    },
    { message: /cancelled/ }
  );
  h.refuse(
    cashier,
    "billing.collect",
    { invoiceId: bill.id, amount: 1, method: "CASH" },
    { message: /cancelled/ }
  );
  h.assertIntact();
  h.assertShadowMatches();
});

test("pharmacy stock: receipts, batch rules, write-off, uncollected prescriptions, shortages", () => {
  const h = new Hospital();
  const pharmacist = h.login("PHARMACIST");
  const desk = h.login("RECEPTIONIST");
  const { doctor, userId: dr } = h.doctorOnDuty();
  const pcm = h.medicine("PCM650");
  const expiry = addDaysIso(h.today, 365);

  const batch = h.run(pharmacist, "pharmacy.receiveStock", {
    medicineId: pcm.id,
    batchNumber: "tst-001",
    expiryDate: expiry,
    quantity: 100,
    costPrice: 1.234,
    supplier: "Sahyadri Pharma Distributors",
    invoiceNumber: "SI/2609/01",
  });
  assert.equal(batch.batchNumber, "TST-001");
  assert.equal(batch.costPrice, 1.23);
  const grn = h.db.pharmacyTransactions.at(-1)!;
  assert.equal(grn.type, "RECEIPT");
  assert.equal(grn.supplier, "Sahyadri Pharma Distributors");
  assert.equal(grn.reference, "SI/2609/01");
  h.refuse(
    pharmacist,
    "pharmacy.receiveStock",
    {
      medicineId: pcm.id,
      batchNumber: "TST-009",
      expiryDate: expiry,
      quantity: 5,
      costPrice: 1,
      supplier: " ",
      invoiceNumber: "SI/1",
    },
    { message: /Supplier is required/ }
  );
  h.run(pharmacist, "pharmacy.receiveStock", {
    medicineId: pcm.id,
    batchNumber: "TST-001",
    expiryDate: expiry,
    quantity: 20,
    costPrice: 1.23,
    supplier: "Sahyadri Pharma Distributors",
    invoiceNumber: "SI/2609/02",
  });
  assert.equal(
    h.db.medicineBatches.find(b => b.id === batch.id)!.quantityOnHand,
    120
  );
  h.refuse(
    pharmacist,
    "pharmacy.receiveStock",
    {
      medicineId: pcm.id,
      batchNumber: "TST-001",
      expiryDate: addDaysIso(expiry, 30),
      quantity: 5,
      costPrice: 1,
      supplier: "Sahyadri Pharma Distributors",
      invoiceNumber: "SI/2609/03",
    },
    { message: /different expiry/ }
  );
  h.refuse(
    pharmacist,
    "pharmacy.receiveStock",
    {
      medicineId: pcm.id,
      batchNumber: "TST-002",
      expiryDate: addDaysIso(h.today, -1),
      quantity: 5,
      costPrice: 1,
      supplier: "Sahyadri Pharma Distributors",
      invoiceNumber: "SI/2609/04",
    },
    { message: /future/ }
  );
  h.refuse(
    h.login("NURSE"),
    "pharmacy.receiveStock",
    {
      medicineId: pcm.id,
      batchNumber: "TST-003",
      expiryDate: expiry,
      quantity: 5,
      costPrice: 1,
      supplier: "Sahyadri Pharma Distributors",
      invoiceNumber: "SI/2609/05",
    },
    { code: "FORBIDDEN" }
  );
  h.run(pharmacist, "pharmacy.writeOff", {
    batchId: batch.id,
    reason: "Damaged in storage",
  });
  assert.equal(
    h.db.medicineBatches.find(b => b.id === batch.id)!.quantityOnHand,
    0
  );
  h.refuse(
    pharmacist,
    "pharmacy.writeOff",
    { batchId: batch.id, reason: "Again" },
    { message: /no stock/ }
  );

  const patient = h.run(desk, "patient.register", newPatient());
  const { encounter, appointment } = h.run(desk, "appointment.walkIn", {
    patientId: patient.id,
    doctorId: doctor.id,
    reason: "Cough",
  });
  h.run(dr, "opd.startConsultation", { appointmentId: appointment.id });
  const insulin = h.medicine("INSGL");
  const stock = h.db.medicineBatches
    .filter(
      b =>
        b.medicineId === insulin.id &&
        b.quantityOnHand > 0 &&
        b.expiryDate > h.today
    )
    .reduce((s, b) => s + b.quantityOnHand, 0);
  const rx = h.run(dr, "rx.create", {
    encounterId: encounter.id,
    items: [
      {
        medicineId: insulin.id,
        dose: "10 units",
        frequency: "OD",
        route: "SC",
        durationDays: 30,
        quantity: stock + 5,
      },
    ],
  });
  const item = h.db.prescriptionItems.find(i => i.prescriptionId === rx.id)!;
  h.refuse(
    pharmacist,
    "pharmacy.dispense",
    {
      prescriptionId: rx.id,
      lines: [{ itemId: item.id, quantity: stock + 1 }],
    },
    {
      message: /Not enough/,
    }
  );
  h.refuse(
    pharmacist,
    "pharmacy.dispense",
    { prescriptionId: rx.id, lines: [{ itemId: item.id, quantity: 0 }] },
    {
      message: /Enter a quantity/,
    }
  );
  h.run(pharmacist, "pharmacy.closeUncollected", {
    prescriptionId: rx.id,
    reason: "Patient purchased outside",
  });
  assert.equal(
    h.db.prescriptions.find(p => p.id === rx.id)!.status,
    "CANCELLED"
  );
  h.refuse(
    pharmacist,
    "pharmacy.closeUncollected",
    { prescriptionId: rx.id, reason: "x" },
    { message: /awaiting/ }
  );

  // Counter (OTC) sale: its own bill, first-expiry-first-out, paid at the
  // counter; prescription-only medicines are refused.
  const buyer = h.run(desk, "patient.register", newPatient());
  const cetirizine = h.db.medicines.find(
    m => !m.prescriptionOnly && m.category === "Antihistamine"
  )!;
  const amox = h.db.medicines.find(
    m => m.prescriptionOnly && m.form === "CAPSULE"
  )!;
  assert.ok(cetirizine && amox, "reference has OTC and Schedule H medicines");
  h.refuse(
    pharmacist,
    "pharmacy.counterSale",
    {
      patientId: buyer.id,
      lines: [{ medicineId: amox.id, quantity: 10 }],
    },
    { message: /prescription-only/ }
  );
  h.refuse(
    desk,
    "pharmacy.counterSale",
    {
      patientId: buyer.id,
      lines: [{ medicineId: cetirizine.id, quantity: 10 }],
    },
    { code: "FORBIDDEN" }
  );
  const before = stockOnHand(h.db, cetirizine.id, h.today);
  const sale = h.run(pharmacist, "pharmacy.counterSale", {
    patientId: buyer.id,
    lines: [{ medicineId: cetirizine.id, quantity: 10 }],
    payment: { method: "UPI", reference: "UPI-OTC-1" },
  });
  assert.equal(stockOnHand(h.db, cetirizine.id, h.today), before - 10);
  assert.equal(sale.total, cetirizine.unitPrice * 10);
  const saleBill = h.db.invoices.find(i => i.id === sale.invoiceId)!;
  assert.equal(saleBill.status, "PAID");
  assert.equal(saleBill.encounterId, undefined, "no visit behind it");
  assert.ok(
    sale.transactions.every(t => t.type === "SALE" && !t.prescriptionItemId)
  );
  const onAccount = h.run(pharmacist, "pharmacy.counterSale", {
    patientId: buyer.id,
    lines: [{ medicineId: cetirizine.id, quantity: 2 }],
  });
  assert.notEqual(onAccount.invoiceId, sale.invoiceId, "one bill per sale");
  assert.equal(
    h.db.invoices.find(i => i.id === onAccount.invoiceId)!.status,
    "PENDING",
    "unpaid sales wait for the billing desk"
  );
  h.refuse(
    pharmacist,
    "pharmacy.counterSale",
    {
      patientId: buyer.id,
      lines: [{ medicineId: cetirizine.id, quantity: before * 10 }],
    },
    { message: /Not enough/ }
  );
  h.assertIntact();
  h.assertShadowMatches();
});

test("beds: housekeeping transitions and manual reservations", () => {
  const h = new Hospital();
  const nurse = h.login("NURSE");
  const bed = h.freeBedFor("MALE");
  h.refuse(
    nurse,
    "beds.setHousekeeping",
    { bedId: bed.id, status: "AVAILABLE" },
    { message: /already available/ }
  );
  h.run(nurse, "beds.setHousekeeping", { bedId: bed.id, status: "CLEANING" });
  h.refuse(
    nurse,
    "beds.setHousekeeping",
    { bedId: bed.id, status: "MAINTENANCE" },
    { message: /note is required/ }
  );
  h.run(nurse, "beds.setHousekeeping", {
    bedId: bed.id,
    status: "MAINTENANCE",
    note: "Side rail broken",
  });
  h.run(nurse, "beds.setHousekeeping", { bedId: bed.id, status: "AVAILABLE" });
  h.run(nurse, "beds.reserve", {
    bedId: bed.id,
    note: "Elective admission tomorrow",
  });
  h.refuse(
    nurse,
    "beds.reserve",
    { bedId: bed.id, note: "Again" },
    { message: /not available/ }
  );
  h.refuse(
    h.login("DOCTOR"),
    "beds.reserve",
    { bedId: bed.id, note: "x" },
    { code: "FORBIDDEN" }
  );
  const occupied = h.db.beds.find(b => b.status === "OCCUPIED")!;
  h.refuse(
    nurse,
    "beds.setHousekeeping",
    { bedId: occupied.id, status: "CLEANING" },
    { message: /occupied/ }
  );

  // A manually reserved bed can take the patient it was held for.
  const { doctor, userId: dr } = h.doctorOnDuty();
  const patient = h.run(
    h.login("RECEPTIONIST"),
    "patient.register",
    newPatient({ gender: "MALE" })
  );
  h.run(dr, "ipd.admit", {
    patientId: patient.id,
    doctorId: doctor.id,
    bedId: bed.id,
    reason: "Elective",
    provisionalDiagnosis: "Hernia",
    source: "DIRECT",
  });
  assert.equal(h.db.beds.find(b => b.id === bed.id)!.status, "OCCUPIED");
  h.assertIntact();
  h.assertShadowMatches();
});

test("complaints and feedback: SLA workflow and follow-ups", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const ops = h.login("OPERATIONS_MANAGER");
  const opsStaff = h.staffOf(ops);
  const gen = h.db.departments.find(d => d.code === "GEN")!;
  const patient = h.run(desk, "patient.register", newPatient());
  const someoneElse = h.db.encounters.find(e => e.patientId !== patient.id)!;

  h.refuse(
    desk,
    "complaint.log",
    {
      patientId: patient.id,
      complainantName: "",
      complainantType: "PATIENT",
      contact: "",
      encounterId: someoneElse.id,
      category: "WAITING_TIME",
      departmentId: gen.id,
      title: "Long wait",
      description: "Waited 2 hours",
      priority: "HIGH",
    },
    { message: /another patient/ }
  );
  const complaint = h.run(desk, "complaint.log", {
    patientId: patient.id,
    complainantName: "",
    complainantType: "PATIENT",
    contact: "",
    category: "WAITING_TIME",
    departmentId: gen.id,
    title: "Long wait at OPD",
    description: "Waited over 2 hours",
    priority: "HIGH",
  });
  assert.equal(complaint.status, "OPEN");
  assert.equal(complaint.dueDate, addDaysIso(h.today, 2));
  assert.equal(
    complaint.complainantName,
    `${patient.firstName} ${patient.lastName}`
  );
  h.refuse(
    ops,
    "complaint.start",
    { complaintId: complaint.id },
    { message: /Assign/ }
  );
  h.refuse(
    desk,
    "complaint.assign",
    { complaintId: complaint.id, staffId: opsStaff.id },
    { code: "FORBIDDEN" }
  );
  h.run(ops, "complaint.assign", {
    complaintId: complaint.id,
    staffId: opsStaff.id,
  });
  h.run(ops, "complaint.start", { complaintId: complaint.id });
  h.run(ops, "complaint.addNote", {
    complaintId: complaint.id,
    text: "Spoke to OPD in-charge",
  });
  h.refuse(
    ops,
    "complaint.resolve",
    { complaintId: complaint.id, resolution: " " },
    { message: /Resolution is required/ }
  );
  h.run(ops, "complaint.resolve", {
    complaintId: complaint.id,
    resolution: "Added a second doctor to the evening OPD",
  });
  h.run(ops, "complaint.close", { complaintId: complaint.id });
  h.refuse(
    ops,
    "complaint.addNote",
    { complaintId: complaint.id, text: "x" },
    { message: /closed/ }
  );
  h.run(ops, "complaint.reopen", {
    complaintId: complaint.id,
    reason: "Complainant not satisfied",
  });
  const reopened = h.db.complaints.find(c => c.id === complaint.id)!;
  assert.equal(reopened.status, "IN_PROGRESS");
  assert.equal(reopened.closedAt, undefined);

  const low = h.run(desk, "feedback.submit", {
    patientId: patient.id,
    anonymous: false,
    departmentId: gen.id,
    rating: 2,
    categories: ["WAITING_TIME", "WAITING_TIME"],
    comments: "Too slow",
    channel: "KIOSK",
  });
  assert.equal(low.followUpStatus, "PENDING");
  assert.deepEqual(low.categories, ["WAITING_TIME"]);
  const high = h.run(desk, "feedback.submit", {
    patientId: patient.id,
    anonymous: true,
    departmentId: gen.id,
    rating: 5,
    categories: [],
    comments: "Great",
    channel: "SMS_LINK",
  });
  assert.equal(high.followUpStatus, "NOT_REQUIRED");
  assert.equal(
    high.patientId,
    undefined,
    "anonymous feedback drops the patient"
  );
  h.refuse(
    desk,
    "feedback.submit",
    {
      anonymous: true,
      departmentId: gen.id,
      rating: 0,
      categories: [],
      comments: "",
      channel: "KIOSK",
    },
    { code: "INVALID_INPUT" }
  );
  h.refuse(
    ops,
    "feedback.updateFollowUp",
    { feedbackId: high.id, status: "COMPLETED", note: "x" },
    { message: /does not need/ }
  );
  h.refuse(
    ops,
    "feedback.updateFollowUp",
    { feedbackId: low.id, status: "COMPLETED" },
    { message: /outcome is required/ }
  );
  h.run(ops, "feedback.updateFollowUp", {
    feedbackId: low.id,
    status: "IN_PROGRESS",
    note: "Called patient",
  });
  h.run(ops, "feedback.updateFollowUp", {
    feedbackId: low.id,
    status: "COMPLETED",
    note: "Apologised; offered priority slot",
  });
  h.assertIntact();
  h.assertShadowMatches();
});

test("workforce: staff with logins, roster, week copy, status changes", () => {
  const h = new Hospital();
  const admin = h.login("ADMINISTRATOR");
  const ops = h.login("OPERATIONS_MANAGER");
  const nur = h.db.departments.find(d => d.code === "NUR")!;
  const gen = h.db.departments.find(d => d.code === "GEN")!;

  const nurse = h.run(ops, "wfm.createStaff", {
    firstName: "Kavya",
    lastName: "Rao",
    role: "NURSE",
    departmentId: nur.id,
    designation: "Staff Nurse",
    phone: "98765 12345",
    email: "Kavya.Rao@hims.example",
  });
  assert.equal(nurse.email, "kavya.rao@hims.example");
  assert.equal(nurse.consultationFee, undefined);
  assert.equal(
    h.db.staff.filter(s => s.id === nurse.id).length,
    1,
    "new ids never collide with seeded ones"
  );
  const login = h.db.users.find(u => u.staffId === nurse.id);
  assert.ok(login, "clinical and office staff get a login");
  assert.equal(login.roleId, "NURSE", "on their job's default role");
  assert.equal(login.username, "kavya.rao");
  assert.equal(login.status, "ACTIVE");
  h.refuse(
    ops,
    "wfm.createStaff",
    {
      firstName: "Dup",
      lastName: "Email",
      role: "NURSE",
      departmentId: nur.id,
      designation: "Staff Nurse",
      phone: "9876512346",
      email: "kavya.rao@hims.example",
    },
    { message: /already uses that email/ }
  );
  h.refuse(
    ops,
    "wfm.createStaff",
    {
      firstName: "Bad",
      lastName: "Email",
      role: "NURSE",
      departmentId: nur.id,
      designation: "Staff Nurse",
      phone: "9876512347",
      email: "not-an-email",
    },
    { message: /valid email/ }
  );
  const porter = h.run(admin, "wfm.createStaff", {
    firstName: "Ramesh",
    lastName: "Gaikwad",
    role: "SUPPORT",
    departmentId: nur.id,
    designation: "Porter",
    phone: "9876512348",
    email: "ramesh.g@hims.example",
  });
  assert.ok(
    !h.db.users.some(u => u.staffId === porter.id),
    "support staff have no login"
  );
  const doctor = h.run(admin, "wfm.createStaff", {
    firstName: "Neha",
    lastName: "Kapoor",
    role: "DOCTOR",
    departmentId: gen.id,
    designation: "Consultant Physician",
    phone: "9876512349",
    email: "neha.kapoor@hims.example",
    consultationFee: 700,
  });
  assert.equal(doctor.consultationFee, 700);

  // The new nurse can sign in and work straight away.
  const shift = h.db.shifts.find(s => s.code === "M")!;
  h.refuse(
    ops,
    "wfm.setRoster",
    { staffId: nurse.id, date: h.today, status: "SCHEDULED" },
    {
      message: /Shift was not found/,
    }
  );
  h.run(ops, "wfm.setRoster", {
    staffId: nurse.id,
    date: h.today,
    status: "SCHEDULED",
    shiftId: shift.id,
  });
  const row = h.run(ops, "wfm.setRoster", {
    staffId: nurse.id,
    date: h.today,
    status: "OFF",
    shiftId: shift.id,
  });
  assert.equal(row.shiftId, undefined, "off days carry no shift");
  h.run(ops, "wfm.setRoster", {
    staffId: doctor.id,
    date: addDaysIso(h.today, 1),
    status: "SCHEDULED",
    shiftId: shift.id,
  });
  const monday = isoDate(startOfWeek(h.now));
  const copied = h.run(ops, "wfm.copyWeek", {
    fromWeekStart: monday,
    departmentId: gen.id,
  });
  assert.ok(copied > 0);
  const next = h.db.roster.filter(
    r => r.date === addDaysIso(monday, 7) && r.departmentId === gen.id
  );
  assert.ok(next.length > 0);

  // The new doctor takes bookings; deactivation is refused while booked.
  const patient = h.run(
    h.login("RECEPTIONIST"),
    "patient.register",
    newPatient()
  );
  h.run(h.login("RECEPTIONIST"), "appointment.book", {
    patientId: patient.id,
    doctorId: doctor.id,
    scheduledAt: h.at(10, 17, 1).toISOString(),
    type: "NEW",
    source: "PHONE",
    reason: "Diabetes review",
  });
  h.refuse(
    ops,
    "wfm.setStaffStatus",
    { staffId: doctor.id, status: "INACTIVE" },
    { message: /upcoming appointments/ }
  );
  h.refuse(
    admin,
    "wfm.setStaffStatus",
    { staffId: h.staffOf(admin).id, status: "INACTIVE" },
    { message: /your own account/ }
  );
  h.run(ops, "wfm.setStaffStatus", { staffId: nurse.id, status: "ON_LEAVE" });
  h.refuse(
    ops,
    "wfm.setStaffStatus",
    { staffId: nurse.id, status: "ON_LEAVE" },
    { message: /already on leave/ }
  );
  h.run(ops, "wfm.setStaffStatus", { staffId: nurse.id, status: "INACTIVE" });
  h.refuse(
    login.id,
    "beds.setHousekeeping",
    { bedId: h.freeBedFor("MALE").id, status: "CLEANING" },
    {
      code: "FORBIDDEN",
      message: /inactive/,
    }
  );
  h.refuse(
    h.login("NURSE"),
    "wfm.setRoster",
    { staffId: nurse.id, date: h.today, status: "OFF" },
    { code: "FORBIDDEN" }
  );
  h.assertIntact();
  h.assertShadowMatches();
});

test("user management: logins, roles and permissions, with safeguards", () => {
  const h = new Hospital();
  const admin = h.login("ADMINISTRATOR");
  const desk = h.login("RECEPTIONIST");
  const ops = h.login("OPERATIONS_MANAGER");
  const nothing = {} as never;

  // Only a login holding users.manage may change access.
  h.refuse(
    desk,
    "admin.createRole",
    { name: "X", description: "", modules: [], actions: [], homePath: "/" },
    { code: "FORBIDDEN" }
  );
  // Nobody can switch off the only Administrator from WFM either.
  h.refuse(
    ops,
    "wfm.setStaffStatus",
    { staffId: h.staffOf(admin).id, status: "INACTIVE" },
    { message: /only active Administrator/ }
  );

  // A new role is stored normalised: the dashboard and each action's module.
  const role = h.run(admin, "admin.createRole", {
    name: "Pharmacy Cashier",
    description: "Counter sales and payment collection.",
    modules: ["pharmacy"],
    actions: ["billing.collect", "pharmacy.dispense"],
    homePath: "/pharmacy",
  });
  assert.deepEqual(role.modules, ["dashboard", "pharmacy", "billing"]);
  assert.deepEqual(role.actions, ["pharmacy.dispense", "billing.collect"]);
  assert.equal(role.system, false);
  h.refuse(
    admin,
    "admin.createRole",
    {
      name: "pharmacy cashier",
      description: "",
      modules: [],
      actions: [],
      homePath: "/",
    },
    { message: /already exists/ }
  );
  h.refuse(
    admin,
    "admin.createRole",
    {
      name: "Ghost",
      description: "",
      modules: ["teleport"],
      actions: [],
      homePath: "/",
    },
    { message: /no module called/ }
  );
  h.refuse(
    admin,
    "admin.createRole",
    {
      name: "Lost",
      description: "",
      modules: ["lab"],
      actions: [],
      homePath: "/billing",
    },
    { message: /cannot open/ }
  );

  // Logins for staff who have none.
  const [first, second] = h.db.staff.filter(
    s => s.role === "SUPPORT" && !h.db.users.some(u => u.staffId === s.id)
  );
  assert.ok(first && second, "support staff start without logins");
  const user = h.run(admin, "admin.createUser", {
    staffId: first.id,
    roleId: role.id,
    username: "Counter.One",
  });
  assert.equal(user.username, "counter.one");
  assert.equal(user.status, "ACTIVE");
  h.refuse(
    admin,
    "admin.createUser",
    { staffId: first.id, roleId: role.id, username: "counter.two" },
    { message: /already has a login/ }
  );
  h.refuse(
    admin,
    "admin.createUser",
    { staffId: second.id, roleId: role.id, username: "counter.one" },
    { message: /already taken/ }
  );
  h.refuse(
    admin,
    "admin.createUser",
    { staffId: second.id, roleId: role.id, username: "x" },
    { message: /3–32 characters/ }
  );
  // The new login works at once, with exactly its role's permissions.
  h.refuse(user.id, "wfm.setRoster", nothing, { code: "FORBIDDEN" });
  assert.notEqual(
    h.refuse(user.id, "billing.collect", nothing).code,
    "FORBIDDEN"
  );

  // Custom access replaces the role's permissions for one login.
  const custom = h.run(admin, "admin.updateUser", {
    userId: user.id,
    customAccess: true,
    modules: [],
    actions: ["beds.housekeeping"],
  });
  assert.deepEqual(custom.modules, ["dashboard", "beds"]);
  h.run(user.id, "beds.setHousekeeping", {
    bedId: h.freeBedFor("MALE").id,
    status: "CLEANING",
  });
  h.refuse(user.id, "billing.collect", nothing, { code: "FORBIDDEN" });
  h.refuse(
    admin,
    "admin.updateUser",
    { userId: user.id, customAccess: true, modules: [], actions: [] },
    { message: /at least one module or action/ }
  );

  // Editing a role changes what its members can do immediately.
  h.run(admin, "admin.updateRole", {
    roleId: "LAB_TECHNICIAN",
    actions: ["lab.collect", "lab.result"],
  });
  h.refuse(h.login("LAB_TECHNICIAN"), "lab.verify", nothing, {
    code: "FORBIDDEN",
  });

  // The Administrator role keeps its name and full access.
  h.refuse(
    admin,
    "admin.updateRole",
    { roleId: "ADMINISTRATOR", actions: [] },
    { message: /always has full access/ }
  );
  h.refuse(
    admin,
    "admin.updateRole",
    { roleId: "ADMINISTRATOR", name: "Boss" },
    { message: /cannot be renamed/ }
  );
  h.refuse(
    admin,
    "admin.deleteRole",
    { roleId: "ADMINISTRATOR" },
    { message: /cannot be deleted/ }
  );

  // Nobody locks themselves or the hospital out.
  h.refuse(
    admin,
    "admin.updateUser",
    { userId: admin, status: "DISABLED" },
    { message: /only active Administrator|your own login/ }
  );
  h.refuse(
    admin,
    "admin.updateUser",
    { userId: admin, roleId: "NURSE" },
    { message: /only active Administrator|own access/ }
  );
  h.refuse(
    admin,
    "admin.deleteUser",
    { userId: admin },
    { message: /your own login/ }
  );
  h.run(admin, "admin.updateUser", { userId: desk, roleId: "ADMINISTRATOR" });
  h.run(desk, "admin.updateUser", {
    userId: admin,
    roleId: "OPERATIONS_MANAGER",
  });
  h.refuse(admin, "admin.createRole", nothing, { code: "FORBIDDEN" });
  h.refuse(
    desk,
    "admin.updateUser",
    { userId: desk, roleId: "NURSE" },
    { message: /only active Administrator/ }
  );

  // A role in use cannot be deleted; an empty one can. Disabling a login
  // takes it off the sign-in screen.
  h.refuse(
    desk,
    "admin.deleteRole",
    { roleId: role.id },
    { message: /still uses/ }
  );
  h.run(desk, "admin.updateUser", { userId: user.id, status: "DISABLED" });
  h.refuse(user.id, "beds.setHousekeeping", nothing, {
    code: "UNAUTHENTICATED",
  });
  h.run(desk, "admin.deleteUser", { userId: user.id });
  h.run(desk, "admin.deleteRole", { roleId: role.id });
  assert.ok(!h.db.roles.some(r => r.id === role.id));
  assert.ok(!h.db.users.some(u => u.id === user.id));

  const logged = h.db.activity.filter(
    e => e.entityType === "user" || e.entityType === "role"
  );
  assert.ok(logged.length >= 8, "every access change is logged");
  h.assertIntact();
  h.assertShadowMatches();
});

test("records: photos, documents, complaint and staff edits, bill lines, prescriptions, formulary", () => {
  const h = new Hospital();
  const desk = h.login("RECEPTIONIST");
  const mrd = h.login("MRD_STAFF");
  const nurse = h.login("NURSE");
  const ops = h.login("OPERATIONS_MANAGER");
  const cashier = h.login("BILLING_EXECUTIVE");
  const pharmacist = h.login("PHARMACIST");
  const { doctor, userId: dr } = h.doctorOnDuty();

  // Patient photo: taken at registration, replaced, removed — images only.
  const patient = h.run(desk, "patient.register", {
    ...newPatient(),
    photo: pngUpload("face.png"),
  });
  const photos = () =>
    h.db.files.filter(
      f => f.ownerType === "PATIENT_PHOTO" && f.ownerId === patient.id
    );
  assert.deepEqual(
    photos().map(f => f.name),
    ["face.png"]
  );
  h.run(desk, "patient.setPhoto", {
    patientId: patient.id,
    photo: pngUpload("retaken.png"),
  });
  assert.deepEqual(
    photos().map(f => f.name),
    ["retaken.png"]
  );
  h.refuse(
    desk,
    "patient.setPhoto",
    { patientId: patient.id, photo: pdfUpload() },
    { code: "INVALID_INPUT" }
  );
  h.refuse(
    desk,
    "patient.setPhoto",
    {
      patientId: patient.id,
      photo: { name: "broken.png", data: "data:image/png;base64,@@" },
    },
    { message: /could not be read/ }
  );
  h.refuse(
    desk,
    "patient.setPhoto",
    {
      patientId: patient.id,
      photo: {
        name: "huge.png",
        data: `data:image/png;base64,${"A".repeat(7_130_000)}`,
      },
    },
    { message: /up to 5 MB/ }
  );
  h.refuse(
    pharmacist,
    "patient.setPhoto",
    { patientId: patient.id, photo: pngUpload() },
    { code: "FORBIDDEN" }
  );
  h.run(desk, "patient.removePhoto", { patientId: patient.id });
  assert.equal(photos().length, 0);
  h.refuse(
    desk,
    "patient.removePhoto",
    { patientId: patient.id },
    { message: /no photo/ }
  );

  // Documents carry their content; removal respects the case file.
  const { appointment, encounter } = h.run(desk, "appointment.walkIn", {
    patientId: patient.id,
    doctorId: doctor.id,
    reason: "Knee pain",
  });
  h.refuse(
    desk,
    "patient.remove",
    { patientId: patient.id },
    { message: /appointments, visits, bills on record/ }
  );
  const referral = h.run(nurse, "document.add", {
    patientId: patient.id,
    encounterId: encounter.id,
    title: "Referral letter",
    kind: "REFERRAL_LETTER",
    file: pdfUpload("referral.pdf"),
  });
  assert.equal(referral.fileName, "referral.pdf");
  assert.match(
    h.db.files.find(
      f => f.ownerType === "DOCUMENT" && f.ownerId === referral.id
    )!.data,
    /^data:application\/pdf;base64,JVBERi0/
  );
  h.refuse(
    nurse,
    "document.add",
    {
      patientId: patient.id,
      title: "Notes",
      kind: "OTHER",
      file: { name: "notes.txt", data: "data:text/plain;base64,aGVsbG8=" },
    },
    { code: "INVALID_INPUT" }
  );
  const stranger = h.run(desk, "patient.register", newPatient());
  h.refuse(
    nurse,
    "document.add",
    {
      patientId: stranger.id,
      encounterId: encounter.id,
      title: "Misfiled",
      kind: "OTHER",
      file: pngUpload(),
    },
    { message: /another patient/ }
  );
  // Details are corrected in place; the file stays as uploaded.
  const retitled = h.run(nurse, "document.update", {
    documentId: referral.id,
    title: "Referral letter — Dr Rao",
    kind: "EXTERNAL_REPORT",
  });
  assert.equal(retitled.title, "Referral letter — Dr Rao");
  assert.equal(retitled.kind, "EXTERNAL_REPORT");
  assert.equal(retitled.fileName, "referral.pdf");
  h.refuse(
    nurse,
    "document.update",
    {
      documentId: referral.id,
      title: "Referral letter — Dr Rao",
      kind: "EXTERNAL_REPORT",
    },
    { message: /Nothing was changed/ }
  );
  h.refuse(
    nurse,
    "document.update",
    {
      documentId: h.db.documents.find(d => d.sourceId)!.id,
      title: "Renamed summary",
      kind: "OTHER",
    },
    { message: /generated from the clinical record/ }
  );
  h.refuse(
    h.login("LAB_TECHNICIAN"),
    "document.update",
    { documentId: referral.id, title: "Mine now", kind: "OTHER" },
    { code: "FORBIDDEN" }
  );
  h.refuse(
    h.login("LAB_TECHNICIAN"),
    "document.remove",
    { documentId: referral.id },
    { code: "FORBIDDEN" }
  );
  h.run(mrd, "document.remove", { documentId: referral.id });
  assert.ok(!h.db.documents.some(d => d.id === referral.id));
  assert.ok(!h.db.files.some(f => f.ownerId === referral.id));
  h.refuse(
    mrd,
    "document.remove",
    { documentId: h.db.documents.find(d => d.sourceId)!.id },
    { message: /generated from the clinical record/ }
  );
  const consentIn = (status: string) =>
    h.db.documents.find(
      d =>
        !d.sourceId &&
        h.db.medicalRecords.some(
          r => r.admissionId === d.admissionId && r.status === status
        )
    )!;
  h.refuse(
    mrd,
    "document.remove",
    { documentId: consentIn("ARCHIVED").id },
    { message: /MRD has reviewed/ }
  );
  h.refuse(
    mrd,
    "document.update",
    { documentId: consentIn("ARCHIVED").id, title: "Consent", kind: "OTHER" },
    { message: /MRD has reviewed/ }
  );
  // A queued case file that loses its consent form goes back to the ward.
  const queued = consentIn("PENDING_REVIEW");
  h.run(mrd, "document.remove", { documentId: queued.id });
  assert.equal(
    h.db.medicalRecords.find(r => r.admissionId === queued.admissionId)!.status,
    "INCOMPLETE"
  );

  // Complaints: details corrected, photos attached and removed.
  const complaint = h.run(desk, "complaint.log", {
    complainantName: "Rahul Shah",
    complainantType: "VISITOR",
    contact: "9822222222",
    category: "FACILITIES",
    departmentId: h.db.departments[0]!.id,
    title: "Broken chair",
    description: "A chair in the waiting area is broken.",
    priority: "LOW",
  });
  const details = {
    complaintId: complaint.id,
    complainantName: "Rahul Shah",
    contact: "9822222222",
    category: "FACILITIES" as const,
    departmentId: complaint.departmentId,
    title: "Broken chair in the OPD waiting area",
    description: "A chair in the waiting area is broken and unsafe.",
    priority: "HIGH" as const,
  };
  h.refuse(desk, "complaint.update", details, { code: "FORBIDDEN" });
  const edited = h.run(ops, "complaint.update", details);
  assert.equal(edited.priority, "HIGH");
  assert.equal(
    edited.dueDate,
    isoDate(addDays(new Date(complaint.createdAt), 2)),
    "a higher priority brings the response target forward"
  );
  h.refuse(ops, "complaint.update", details, {
    message: /Nothing was changed/,
  });
  const first = h.run(desk, "complaint.attachPhoto", {
    complaintId: complaint.id,
    photo: pngUpload("chair.png"),
  });
  for (let n = 2; n <= 6; n += 1)
    h.run(desk, "complaint.attachPhoto", {
      complaintId: complaint.id,
      photo: pngUpload(`chair-${n}.png`),
    });
  h.refuse(
    desk,
    "complaint.attachPhoto",
    { complaintId: complaint.id, photo: pngUpload() },
    { message: /up to 6 photos/ }
  );
  h.refuse(
    desk,
    "complaint.removePhoto",
    { fileId: first.fileId },
    { code: "FORBIDDEN" }
  );
  h.run(ops, "complaint.removePhoto", { fileId: first.fileId });
  h.refuse(
    ops,
    "complaint.removePhoto",
    { fileId: h.db.files.find(f => f.ownerType === "DOCUMENT")!.id },
    { message: /not a complaint photo/ }
  );

  // Staff records: edited (job role unchanged), photo set and removed.
  const clerk = h.staffOf(desk);
  const staffEdit = {
    staffId: clerk.id,
    firstName: clerk.firstName,
    lastName: "Deshpande",
    departmentId: clerk.departmentId,
    designation: "Senior front office executive",
    phone: clerk.phone,
    email: clerk.email,
  };
  h.refuse(desk, "wfm.updateStaff", staffEdit, { code: "FORBIDDEN" });
  const renamed = h.run(ops, "wfm.updateStaff", staffEdit);
  assert.equal(renamed.lastName, "Deshpande");
  assert.equal(renamed.role, clerk.role);
  h.refuse(
    ops,
    "wfm.updateStaff",
    { ...staffEdit, email: h.db.staff.find(s => s.id !== clerk.id)!.email },
    { message: /already uses that email/ }
  );
  const busyDoctor = h.db.staff.find(s =>
    h.db.appointments.some(
      a =>
        a.doctorId === s.id &&
        a.status === "SCHEDULED" &&
        a.scheduledAt >= h.now.toISOString()
    )
  )!;
  h.refuse(
    ops,
    "wfm.updateStaff",
    {
      staffId: busyDoctor.id,
      firstName: busyDoctor.firstName,
      lastName: busyDoctor.lastName,
      departmentId: h.db.departments.find(
        d => d.kind === "CLINICAL" && d.id !== busyDoctor.departmentId
      )!.id,
      designation: busyDoctor.designation,
      phone: busyDoctor.phone,
      email: busyDoctor.email,
    },
    { message: /upcoming appointments/ }
  );
  h.run(ops, "wfm.setStaffPhoto", { staffId: clerk.id, photo: pngUpload() });
  h.run(ops, "wfm.removeStaffPhoto", { staffId: clerk.id });
  h.refuse(
    ops,
    "wfm.removeStaffPhoto",
    { staffId: clerk.id },
    { message: /no photo/ }
  );

  // Bill lines: only desk-entered charges can be removed, never below what
  // has been paid.
  const bill = h.db.invoices.find(i => i.encounterId === encounter.id)!;
  const typo = h.run(cashier, "billing.addCharge", {
    invoiceId: bill.id,
    category: "PROCEDURE",
    description: "Dressing (entered twice)",
    quantity: 1,
    unitPrice: 300,
  });
  h.refuse(
    cashier,
    "billing.removeCharge",
    {
      itemId: h.db.invoiceItems.find(
        i => i.invoiceId === bill.id && i.sourceType !== "MANUAL"
      )!.id,
    },
    { message: /Only charges added at the billing desk/ }
  );
  h.refuse(
    desk,
    "billing.removeCharge",
    { itemId: typo.id },
    {
      code: "FORBIDDEN",
    }
  );
  const withTypo = invoiceTotals(h.db, bill.id).total;
  h.run(cashier, "billing.removeCharge", { itemId: typo.id });
  assert.equal(invoiceTotals(h.db, bill.id).total, withTypo - 300);
  const dressing = h.run(cashier, "billing.addCharge", {
    invoiceId: bill.id,
    category: "PROCEDURE",
    description: "Dressing",
    quantity: 1,
    unitPrice: 500,
  });
  h.run(cashier, "billing.collect", {
    invoiceId: bill.id,
    amount: invoiceTotals(h.db, bill.id).balance - 100,
    method: "CASH",
  });
  h.refuse(
    cashier,
    "billing.removeCharge",
    { itemId: dressing.id },
    { message: /Refund the difference first/ }
  );

  // Prescriptions: the prescriber withdraws one the pharmacy has not started.
  h.run(dr, "opd.startConsultation", { appointmentId: appointment.id });
  const line = {
    medicineId: h.medicine("PCM500").id,
    dose: "1 tablet",
    frequency: "TDS" as const,
    route: "ORAL" as const,
    durationDays: 3,
  };
  const wrong = h.run(dr, "rx.create", {
    encounterId: encounter.id,
    items: [line],
  });
  h.refuse(
    pharmacist,
    "rx.cancel",
    { prescriptionId: wrong.id, reason: "x" },
    { code: "FORBIDDEN" }
  );
  h.refuse(
    dr,
    "rx.cancel",
    { prescriptionId: wrong.id, reason: " " },
    { message: /Reason is required/ }
  );
  h.run(dr, "rx.cancel", {
    prescriptionId: wrong.id,
    reason: "Changed to a syrup",
  });
  assert.equal(
    h.db.prescriptions.find(p => p.id === wrong.id)!.status,
    "CANCELLED"
  );
  h.refuse(
    dr,
    "rx.cancel",
    { prescriptionId: wrong.id, reason: "Again" },
    { message: /already cancelled/ }
  );
  const started = h.run(dr, "rx.create", {
    encounterId: encounter.id,
    items: [line],
  });
  h.run(pharmacist, "pharmacy.dispense", {
    prescriptionId: started.id,
    lines: [
      {
        itemId: h.db.prescriptionItems.find(
          i => i.prescriptionId === started.id
        )!.id,
        quantity: 3,
      },
    ],
  });
  h.refuse(
    dr,
    "rx.cancel",
    { prescriptionId: started.id, reason: "Stop" },
    { message: /already been dispensed/ }
  );

  // Formulary: add, edit, and delete only what was never used.
  const medicine = {
    name: "Testocillin",
    genericName: "Amoxicillin",
    form: "CAPSULE" as const,
    strength: "250 mg",
    unit: "Capsule",
    category: "Antibiotic",
    unitPrice: 6.5,
    reorderLevel: 100,
    manufacturer: "Test Pharma",
    prescriptionOnly: true,
  };
  h.refuse(desk, "pharmacy.createMedicine", medicine, { code: "FORBIDDEN" });
  const added = h.run(pharmacist, "pharmacy.createMedicine", medicine);
  assert.equal(added.code, "TESTO250");
  assert.equal(added.unit, "capsule");
  h.refuse(pharmacist, "pharmacy.createMedicine", medicine, {
    message: /already in the formulary/,
  });
  const repriced = h.run(pharmacist, "pharmacy.updateMedicine", {
    medicineId: added.id,
    medicine: { ...medicine, unitPrice: 7 },
  });
  assert.equal(repriced.unitPrice, 7);
  h.refuse(
    pharmacist,
    "pharmacy.updateMedicine",
    { medicineId: added.id, medicine: { ...medicine, reorderLevel: -1 } },
    { code: "INVALID_INPUT" }
  );
  h.refuse(
    pharmacist,
    "pharmacy.deleteMedicine",
    { medicineId: h.medicine("PCM500").id },
    { message: /stays in the formulary/ }
  );
  h.run(pharmacist, "pharmacy.deleteMedicine", { medicineId: added.id });
  assert.ok(!h.db.medicines.some(m => m.id === added.id));

  h.assertIntact();
  h.assertShadowMatches();
});

test("every registered operation was exercised successfully", () => {
  const missing = OPERATION_NAMES.filter(name => !exercised.has(name));
  assert.deepEqual(
    missing,
    [],
    `never run successfully: ${missing.join(", ")}`
  );
});
