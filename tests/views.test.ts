/**
 * Every read view runs on a real hospital and returns plain JSON — exactly
 * what the server sends — and reflects writes immediately.
 */
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { test } from "node:test";

import { OperationError } from "../lib/ops/execute";
import { prepareView } from "../lib/views/execute";
import { VIEW_NAMES, type ViewName } from "../lib/views/registry";
import { sessionView } from "../lib/views/system";
import { addDaysIso, isoDate, startOfWeek } from "../lib/sim/time";
import { Hospital, newPatient, pngUpload } from "./helpers";

const h = new Hospital();
const admin = h.login("ADMINISTRATOR");
const anyEncounter = h.db.encounters.find(e => e.type === "OPD")!;
const anyAdmission = h.db.admissions.find(a => a.status !== "DISCHARGED")!;
const anyDoctor = h.doctorOnDuty().doctor;

/** Representative parameters for each view. */
const PARAMS: Record<ViewName, unknown> = {
  "dashboard.home": {},
  "dashboard.trend": {},
  "analytics.overview": { days: 30 },
  "operations.overview": {},
  "enquiry.list": { view: "open" },
  "enquiry.summary": {},
  "enquiry.detail": { id: h.db.enquiries[0]!.id },
  "opd.dashboard": { doctorId: anyDoctor.id },
  "opd.appointments": { from: h.today, to: addDaysIso(h.today, 7) },
  "opd.visit": { encounterId: anyEncounter.id },
  "opd.tokenBoard": {},
  "opd.doctorOptions": { date: h.today },
  "opd.doctorSlots": { doctorId: anyDoctor.id, date: h.today },
  "patients.search": { query: "a" },
  "patients.list": { filter: "all" },
  "patients.record": { id: h.db.patients[0]!.id },
  "ipd.admissions": { scope: "inhouse" },
  "ipd.admission": { id: anyAdmission.id },
  "ipd.freeBeds": {},
  "beds.board": {},
  "lab.worklist": { stage: "all" },
  "lab.order": { id: h.db.labOrders[0]!.id },
  "pharmacy.queue": { view: "open" },
  "pharmacy.prescription": { id: h.db.prescriptions[0]!.id },
  "pharmacy.inventory": {},
  "pharmacy.transactions": { days: 7 },
  "catalog.medicines": {},
  "catalog.labTests": {},
  "catalog.departments": {},
  "catalog.staff": { roles: ["DOCTOR"] },
  "billing.invoices": { view: "all" },
  "billing.summary": {},
  "billing.invoice": { id: h.db.invoices[0]!.id },
  "billing.collections": { date: h.today },
  "mrd.records": { view: "all" },
  "mrd.summary": {},
  "mrd.record": { id: h.db.medicalRecords[0]!.id },
  "complaints.list": { view: "all" },
  "complaints.summary": {},
  "complaints.detail": { id: h.db.complaints[0]!.id },
  "feedback.list": { view: "all", days: 30 },
  "feedback.summary": { days: 30 },
  "feedback.patientEncounters": { patientId: anyEncounter.patientId },
  "wfm.staff": {},
  "wfm.profile": { id: h.db.staff[0]!.id },
  "wfm.roster": { weekStart: isoDate(startOfWeek(h.now)) },
  "search.records": { query: "ha" },
  "files.get": { id: h.db.files[0]!.id },
  "system.integrity": {},
  "session.directory": {},
  "admin.users": {},
  "admin.roles": {},
  "admin.audit": { limit: 50 },
};

function read(name: ViewName, params: unknown = PARAMS[name], user = admin) {
  return prepareView(h.db, user, name, params).run(h.db, h.now);
}

test("every view runs and returns plain JSON", () => {
  for (const name of VIEW_NAMES) {
    const result = read(name);
    assert.notEqual(result, undefined, `${name} returned nothing`);
    const copy = JSON.parse(JSON.stringify(result ?? null)) as unknown;
    assert.ok(
      isDeepStrictEqual(copy, JSON.parse(JSON.stringify(copy))) &&
        isDeepStrictEqual(normalise(result), copy),
      `${name} returns values that do not survive JSON (Dates, Maps, NaN…)`
    );
  }
});

/** Drops undefined keys the way JSON does, keeping everything else. */
function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, normalise(v)])
    );
  }
  return value;
}

test("views validate their parameters", () => {
  assert.throws(
    () => read("opd.appointments", { from: "yesterday", to: h.today }),
    (e: unknown) => e instanceof OperationError && e.code === "INVALID_INPUT"
  );
  assert.throws(
    () => read("lab.worklist", { stage: "everything" }),
    (e: unknown) => e instanceof OperationError && e.code === "INVALID_INPUT"
  );
  assert.throws(
    () => read("no.such.view" as ViewName, {}),
    (e: unknown) =>
      e instanceof OperationError && e.code === "UNKNOWN_OPERATION"
  );
});

test("detail views return null for unknown ids instead of failing", () => {
  assert.equal(read("opd.visit", { encounterId: "enc_missing" }), null);
  assert.equal(read("ipd.admission", { id: "adm_missing" }), null);
  assert.equal(read("billing.invoice", { id: "inv_missing" }), null);
  assert.equal(read("patients.record", { id: "pat_missing" }), null);
  assert.equal(read("files.get", { id: "fil_missing" }), null);
});

test("files are served only to logins that can see what they belong to", () => {
  const scan = h.db.files.find(f => f.ownerType === "DOCUMENT")!;
  const doc = read("files.get", { id: scan.id }) as { data: string } | null;
  assert.ok(doc?.data.startsWith("data:application/pdf;base64,"));
  assert.ok(read("files.get", { id: scan.id }, h.login("MRD_STAFF")));

  // A staff photo is for Workforce, Administration and the person.
  const tech = h.login("LAB_TECHNICIAN");
  const { fileId } = h.run(admin, "wfm.setStaffPhoto", {
    staffId: h.staffOf(tech).id,
    photo: pngUpload(),
  });
  assert.ok(read("files.get", { id: fileId }, h.login("OPERATIONS_MANAGER")));
  assert.ok(read("files.get", { id: fileId }, tech), "their own photo");
  assert.equal(read("files.get", { id: fileId }, h.login("PHARMACIST")), null);
});

test("views reflect writes at once and respect the signed-in role", () => {
  const desk = h.login("RECEPTIONIST");
  const patient = h.run(
    desk,
    "patient.register",
    newPatient({ firstName: "Zubin" })
  );
  const hits = read("patients.search", { query: "Zubin" }) as Array<{
    id: string;
  }>;
  assert.ok(hits.some(p => p.id === patient.id));
  const records = read("search.records", { query: patient.uhid }) as Array<{
    href: string;
  }>;
  assert.ok(records.some(r => r.href === `/patients/${patient.id}`));

  // Search is limited to what the role can open: nurses have no billing.
  const hit = h.db.invoices[0]!;
  const billingHits = read(
    "search.records",
    { query: hit.code },
    h.login("BILLING_EXECUTIVE")
  ) as Array<{ kind: string }>;
  assert.ok(billingHits.some(r => r.kind === "invoice"));
  const nurse = h.login("NURSE");
  const nurseHits = read(
    "search.records",
    { query: hit.code },
    nurse
  ) as Array<{ kind: string }>;
  assert.ok(
    nurseHits.every(r => r.kind !== "invoice"),
    "nurses cannot open billing"
  );

  // The dashboard is built for the actor, not for a role the client names.
  const nurseBoard = read("dashboard.home", {}, nurse) as {
    queues: Array<{ title: string }>;
  };
  const deskBoard = read("dashboard.home", {}, desk) as {
    queues: Array<{ title: string }>;
  };
  assert.notDeepEqual(
    nurseBoard.queues.map(q => q.title),
    deskBoard.queues.map(q => q.title)
  );
});

test("each login's dashboard carries only its own areas", () => {
  type Board = {
    metrics: Array<{ module: string }>;
    queues: Array<{ href: string }>;
    alerts: Array<{ area: string }>;
    hints: Record<string, string>;
  };
  const moduleOf: Record<string, string> = {
    OPD: "opd",
    IPD: "ipd",
    Lab: "lab",
    Pharmacy: "pharmacy",
    Billing: "billing",
    Complaints: "complaints",
    MRD: "mrd",
  };
  for (const role of ["LAB_TECHNICIAN", "PHARMACIST", "NURSE"] as const) {
    const user = h.login(role);
    const session = sessionView(h.db, user)!;
    const opens = new Set<string>(session.access.modules);
    const board = read("dashboard.home", {}, user) as Board;
    for (const m of board.metrics)
      assert.ok(opens.has(m.module), `${role} sees a ${m.module} figure`);
    for (const a of board.alerts)
      if (moduleOf[a.area])
        assert.ok(
          opens.has(moduleOf[a.area]!) ||
            (a.area === "Beds" && opens.has("ipd")),
          `${role} gets a ${a.area} alert`
        );
    assert.ok(
      !board.metrics.some(m => m.module === "billing") || opens.has("billing"),
      `${role} sees no takings`
    );
    const trend = read("dashboard.trend", {}, user) as {
      revenue: unknown;
    } | null;
    if (!opens.has("billing") && !opens.has("analytics"))
      assert.equal(trend?.revenue ?? null, null, `${role} gets no revenue`);
  }
  // Doctors get their own patients; the lab gets the worklist.
  const doctorBoard = read("dashboard.home", {}, h.login("DOCTOR")) as Board;
  assert.ok(doctorBoard.queues.some(q => q.href === "/opd"));
  const labBoard = read(
    "dashboard.home",
    {},
    h.login("LAB_TECHNICIAN")
  ) as Board;
  assert.deepEqual(
    labBoard.queues.map(q => q.href),
    ["/lab"]
  );
});

test("the sign-in directory mirrors User management", () => {
  const directory = read("session.directory", {}, null as never) as Array<{
    id: string;
    name: string;
    modules: string[];
    users: Array<{ userId: string; primary: boolean; username: string }>;
  }>;
  assert.deepEqual(
    directory.map(r => r.id),
    h.db.roles.map(r => r.id),
    "every role, in table order"
  );
  for (const role of directory) {
    const stored = h.db.roles.find(r => r.id === role.id)!;
    assert.equal(role.name, stored.name);
    for (const p of role.users) {
      const user = h.db.users.find(u => u.id === p.userId)!;
      assert.equal(user.roleId, role.id);
      assert.equal(user.status, "ACTIVE");
      assert.equal(p.username, user.username);
      assert.equal(
        h.db.staff.find(s => s.id === user.staffId)!.status,
        "ACTIVE"
      );
    }
    const firstNonPrimary = role.users.findIndex(p => !p.primary);
    if (firstNonPrimary >= 0)
      assert.ok(
        role.users.slice(firstNonPrimary).every(p => !p.primary),
        role.name
      );
  }
  const active = h.db.users.filter(
    u =>
      u.status === "ACTIVE" &&
      h.db.staff.find(s => s.id === u.staffId)!.status === "ACTIVE"
  );
  assert.equal(
    directory.reduce((n, r) => n + r.users.length, 0),
    active.length,
    "every active login appears exactly once"
  );
});
