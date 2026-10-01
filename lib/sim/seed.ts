/**
 * Builds a fresh simulation by *replaying* ~30 days of hospital activity
 * through the same domain services the UI uses, on an event clock that ends
 * at "now". Nothing is written directly into transactional tables, so every
 * seeded record obeys the same integrity rules as live data — and whatever is
 * mid-flight at "now" (patients waiting, samples in processing, beds being
 * cleaned) is left exactly there.
 */
import * as billing from "../domain/billing";
import * as enquiry from "../domain/enquiry";
import * as ipd from "../domain/ipd";
import * as lab from "../domain/lab";
import * as mrd from "../domain/mrd";
import * as opd from "../domain/opd";
import * as patients from "../domain/patients";
import * as pharmacy from "../domain/pharmacy";
import * as quality from "../domain/quality";
import { doctorAvailability } from "../domain/wfm";
import { DEFAULT_ROLES, normaliseGrants } from "../rbac";
import {
  ALLERGIES,
  CHRONIC,
  CONDITIONS,
  DEPARTMENTS,
  HOSPITAL,
  FIRST_NAMES_FEMALE,
  FIRST_NAMES_MALE,
  isPrescriptionOnly,
  LAB_TESTS,
  LAST_NAMES,
  LOCALITIES,
  MEDICINES,
  SHIFTS,
  STAFF,
  SUPPLIERS,
  type ConditionTemplate,
  type MedTemplate,
  WARDS,
} from "./reference";
import { Rng } from "./rng";
import { consentFormScan } from "./scans";
import {
  emptyDatabase,
  type Admission,
  type ComplaintCategory,
  type Database,
  type FeedbackCategory,
  type Gender,
  type ID,
  type Patient,
  type PaymentMethod,
  type Staff,
  type StaffRole,
  SYSTEM_ROLES,
} from "./schema";
import {
  DAY,
  HOUR,
  addDays,
  addMinutes,
  atTime,
  clockMinutes,
  isoDate,
  startOfDay,
} from "./time";
import { find, newId, type Tx } from "./tx";

/**
 * Logins that differ from their job's default role, so User management has
 * real cases to show: a custom role, a custom permission set and a login
 * that has been switched off.
 */
const LOGIN_VARIATIONS: Record<
  string,
  {
    role?: "Ward In-charge";
    access?: { modules: string[]; actions: string[] };
    disabled?: boolean;
  }
> = {
  "Mary Joseph": { role: "Ward In-charge" },
  "Imran Shaikh": {
    // Also runs the pharmacy's payment counter.
    access: normaliseGrants(
      [...DEFAULT_ROLES.PHARMACIST.modules],
      [...DEFAULT_ROLES.PHARMACIST.actions, "billing.collect"]
    ),
  },
  "Aditya Kale": { disabled: true },
};

export const HISTORY_DAYS = 30;

export interface SeedStats {
  events: number;
  failures: Record<string, number>;
  failureSamples: string[];
  ms: number;
}

/* ------------------------------------------------------------------ */
/* Event queue                                                         */
/* ------------------------------------------------------------------ */

interface SimEvent {
  at: number;
  seq: number;
  label: string;
  run: (at: Date) => void;
}

class EventQueue {
  private heap: SimEvent[] = [];
  private seq = 0;

  push(at: Date | number, label: string, run: (at: Date) => void) {
    const event = {
      at: typeof at === "number" ? at : at.getTime(),
      seq: this.seq++,
      label,
      run,
    };
    this.heap.push(event);
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(this.heap[parent]!, this.heap[i]!)) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i]!, this.heap[parent]!];
      i = parent;
    }
  }

  pop(): SimEvent | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (!top || !last) return top;
    if (this.heap.length) {
      this.heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.heap.length && this.less(this.heap[l]!, this.heap[m]!))
          m = l;
        if (r < this.heap.length && this.less(this.heap[r]!, this.heap[m]!))
          m = r;
        if (m === i) break;
        [this.heap[m], this.heap[i]] = [this.heap[i]!, this.heap[m]!];
        i = m;
      }
    }
    return top;
  }

  private less(a: SimEvent, b: SimEvent) {
    return a.at < b.at || (a.at === b.at && a.seq < b.seq);
  }
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

export function generateDatabase(
  now: Date = new Date(),
  seed = 240917
): { db: Database; stats: SeedStats } {
  const started = Date.now();
  const rng = new Rng(seed);
  const nowIso = now.toISOString();
  const db = emptyDatabase(nowIso);
  const today = startOfDay(now);
  const origin = addDays(today, -HISTORY_DAYS);
  const queue = new EventQueue();
  const stats: SeedStats = {
    events: 0,
    failures: {},
    failureSamples: [],
    ms: 0,
  };

  const tx = (at: Date, actorId: ID): Tx => ({ db, now: at, actorId });
  const longAgo = addDays(today, -420).toISOString();

  /* -------------------------- organisation -------------------------- */

  const deptByCode = new Map<string, ID>();
  DEPARTMENTS.forEach((d, i) => {
    const id = `dep_${i + 1}`;
    deptByCode.set(d.code, id);
    db.departments.push({ id, ...d, createdAt: longAgo, updatedAt: longAgo });
  });
  const dept = (code: string) => deptByCode.get(code)!;

  // Access roles: the defaults, plus one the hospital defined itself.
  for (const id of SYSTEM_ROLES) {
    const role = DEFAULT_ROLES[id];
    db.roles.push({
      id,
      name: role.name,
      description: role.description,
      modules: [...role.modules],
      actions: [...role.actions],
      homePath: role.homePath,
      system: true,
      createdAt: longAgo,
      updatedAt: longAgo,
    });
  }

  // Staff and logins are also created at runtime (WFM → Add staff, User
  // management), so their ids come from the same counters the domain
  // services use and never clash.
  const setup = tx(new Date(longAgo), "system");
  const wardInCharge = normaliseGrants(
    [...DEFAULT_ROLES.NURSE.modules, "wfm"],
    [
      ...DEFAULT_ROLES.NURSE.actions,
      "wfm.manage",
      "beds.housekeeping",
      "complaint.manage",
    ]
  );
  db.roles.push({
    id: newId(setup, "rol"),
    name: "Ward In-charge",
    description:
      "Senior ward nurse: nursing duties plus the ward roster, bed turnaround and complaint follow-up.",
    ...wardInCharge,
    homePath: "/beds",
    system: false,
    createdAt: longAgo,
    updatedAt: longAgo,
  });
  STAFF.forEach((s, i) => {
    const id = newId(setup, "stf");
    const slug = `${s.first}.${s.last}`.toLowerCase().replace(/[^a-z.]/g, "");
    db.staff.push({
      id,
      staffCode: `EMP-${String(i + 1).padStart(4, "0")}`,
      firstName: s.first,
      lastName: s.last,
      role: s.role,
      departmentId: dept(s.dept),
      designation: s.designation,
      specialisation: s.specialisation,
      qualification: s.qualification,
      phone: `98${String(22000000 + i * 7919).slice(0, 8)}`,
      email: `${slug}@hims.example`,
      status: "ACTIVE",
      joinedOn: isoDate(addDays(today, -rng.int(200, 3000))),
      consultationFee: s.fee,
      createdAt: longAgo,
      updatedAt: longAgo,
    });
    if ((SYSTEM_ROLES as readonly StaffRole[]).includes(s.role)) {
      const custom = LOGIN_VARIATIONS[`${s.first} ${s.last}`];
      db.users.push({
        id: newId(setup, "usr"),
        staffId: id,
        roleId:
          custom?.role === "Ward In-charge"
            ? db.roles.find(r => r.name === custom.role)!.id
            : s.role,
        username: slug,
        status: custom?.disabled ? "DISABLED" : "ACTIVE",
        customAccess: Boolean(custom?.access),
        modules: custom?.access?.modules ?? [],
        actions: custom?.access?.actions ?? [],
        createdAt: longAgo,
        updatedAt: longAgo,
      });
    }
  });
  db.meta.counters["staff"] = STAFF.length;

  const staffOf = (role: StaffRole) => db.staff.filter(s => s.role === role);
  const doctors = staffOf("DOCTOR");
  const nurses = staffOf("NURSE");
  const receptionists = staffOf("RECEPTIONIST");
  const pharmacists = staffOf("PHARMACIST");
  const labTechs = staffOf("LAB_TECHNICIAN");
  const billers = staffOf("BILLING_EXECUTIVE");
  const mrdStaff = staffOf("MRD_STAFF");
  const opsManagers = staffOf("OPERATIONS_MANAGER");
  const support = staffOf("SUPPORT");
  const primaryDoctor = doctors[0]!;

  SHIFTS.forEach((s, i) => db.shifts.push({ id: `shf_${i + 1}`, ...s }));
  const shiftId = (code: string) => db.shifts.find(s => s.code === code)!.id;

  WARDS.forEach((w, wi) => {
    const wardId = `wrd_${wi + 1}`;
    db.wards.push({
      id: wardId,
      code: w.code,
      name: w.name,
      floor: w.floor,
      category: w.category,
      departmentId: w.dept ? dept(w.dept) : undefined,
      dailyRate: w.dailyRate,
      restriction: w.restriction,
      createdAt: longAgo,
      updatedAt: longAgo,
    });
    w.rooms.forEach(room => {
      const roomId = `rm_${w.code}_${room.number}`;
      db.rooms.push({ id: roomId, wardId, number: room.number });
      for (let b = 0; b < room.beds; b += 1) {
        const label =
          room.beds === 1
            ? `${room.number}`
            : `${room.number}-${String.fromCharCode(65 + b)}`;
        db.beds.push({
          id: `bed_${w.code}_${label}`,
          roomId,
          code: w.code === "HDU" ? `HDU-${b + 1}` : label,
          status: "AVAILABLE",
          statusChangedAt: longAgo,
          createdAt: longAgo,
          updatedAt: longAgo,
        });
      }
    });
  });

  MEDICINES.forEach((m, i) => {
    db.medicines.push({
      id: `med_${i + 1}`,
      code: m.code,
      name: m.name,
      genericName: m.generic,
      form: m.form,
      strength: m.strength,
      unit: m.unit,
      category: m.category,
      unitPrice: m.price,
      reorderLevel: m.reorder,
      manufacturer: m.maker,
      prescriptionOnly: isPrescriptionOnly(m),
      createdAt: longAgo,
      updatedAt: longAgo,
    });
  });
  const medByCode = new Map(db.medicines.map(m => [m.code, m]));

  LAB_TESTS.forEach((t, i) => {
    db.labTests.push({
      id: `lt_${i + 1}`,
      code: t.code,
      name: t.name,
      section: t.section,
      sampleType: t.sample,
      price: t.price,
      turnaroundHours: t.tat,
      parameters: t.params.map((p, pi) => ({
        id: `lp_${i + 1}_${pi + 1}`,
        ...p,
      })),
    });
  });
  const testByCode = new Map(db.labTests.map(t => [t.code, t]));

  /* ------------------------------ roster ----------------------------- */

  const rosterIndex = new Map<string, { status: string; shift?: string }>();
  const leaveDays = new Map<ID, Set<number>>();
  for (const doctor of doctors) {
    if (doctor.id === primaryDoctor.id) continue;
    const set = new Set<number>();
    if (rng.chance(0.6)) {
      const start = rng.int(-28, 10);
      const length = rng.int(1, 3);
      for (let k = 0; k < length; k += 1)
        if (start + k !== 0) set.add(start + k);
    }
    leaveDays.set(doctor.id, set);
  }
  const onLeaveNurse = nurses[7]!;
  onLeaveNurse.status = "ON_LEAVE";

  for (let d = -HISTORY_DAYS - 5; d <= 14; d += 1) {
    const date = addDays(today, d);
    const iso = isoDate(date);
    const weekday = date.getDay();
    db.staff.forEach((staff, index) => {
      let status: "SCHEDULED" | "OFF" | "LEAVE" = "SCHEDULED";
      let shift: string | undefined;
      switch (staff.role) {
        case "DOCTOR": {
          const docIndex = doctors.indexOf(staff);
          if (leaveDays.get(staff.id)?.has(d)) status = "LEAVE";
          else if (weekday === 0) {
            const onCall =
              docIndex % 7 === Math.abs(Math.floor(d / 7)) % 7 ||
              docIndex === (Math.abs(Math.floor(d / 7)) + 3) % doctors.length;
            if (onCall || staff.id === primaryDoctor.id) shift = "M";
            else status = "OFF";
          } else
            shift = docIndex % 3 === 1 ? "M" : docIndex % 3 === 2 ? "E" : "G";
          break;
        }
        case "NURSE":
        case "PHARMACIST":
        case "LAB_TECHNICIAN":
        case "SUPPORT": {
          // Balanced teams per role (M / E / N), each person off one day a
          // week on a staggered day, rotating team every fortnight.
          const pool = db.staff.filter(s => s.role === staff.role);
          const i = pool.indexOf(staff);
          const team = ["M", "E", "N"][(i + Math.floor((d + 700) / 14)) % 3]!;
          if ((d + 700 + i * 3) % 7 === 0) status = "OFF";
          else shift = team;
          break;
        }
        case "RECEPTIONIST":
        case "BILLING_EXECUTIVE": {
          const code = ["M", "E", "M", "E", "M", "E", "OFF"][
            (d + 700 + index) % 7
          ]!;
          if (code === "OFF") status = "OFF";
          else shift = code;
          break;
        }
        default:
          if (weekday === 0) status = "OFF";
          else shift = "G";
      }
      if (staff.id === onLeaveNurse.id && d >= -2 && d <= 4) {
        status = "LEAVE";
        shift = undefined;
      }
      db.roster.push({
        id: `ros_${staff.id}_${iso}`,
        staffId: staff.id,
        date: iso,
        status,
        shiftId: shift ? shiftId(shift) : undefined,
        departmentId: staff.departmentId,
        note: status === "LEAVE" ? "Planned leave" : undefined,
      });
      rosterIndex.set(`${staff.id}|${iso}`, { status, shift });
    });
  }

  const shiftWindow = (code: string, date: Date) => {
    const s = SHIFTS.find(x => x.code === code)!;
    const from = addMinutes(startOfDay(date), clockMinutes(s.start));
    let to = addMinutes(startOfDay(date), clockMinutes(s.end));
    if (to <= from) to = addDays(to, 1);
    return { from, to };
  };

  const onDuty = (staff: Staff, at: Date) => {
    for (const day of [at, addDays(at, -1)]) {
      const row = rosterIndex.get(`${staff.id}|${isoDate(day)}`);
      if (row?.status !== "SCHEDULED" || !row.shift) continue;
      const { from, to } = shiftWindow(row.shift, day);
      if (at >= from && at < to) return true;
    }
    return false;
  };

  const pickStaff = (pool: Staff[], at: Date) => {
    const available = pool.filter(s => s.status === "ACTIVE" && onDuty(s, at));
    return rng.pick(
      available.length ? available : pool.filter(s => s.status === "ACTIVE")
    );
  };

  /* ---------------------------- scheduling --------------------------- */

  const schedule = (at: Date, label: string, run: (at: Date) => void) => {
    if (at.getTime() > now.getTime()) return;
    if (at.getTime() < origin.getTime() - 3 * DAY) return;
    queue.push(at, label, run);
  };

  const fail = (label: string, error: unknown) => {
    stats.failures[label] = (stats.failures[label] ?? 0) + 1;
    if (stats.failureSamples.length < 40) {
      stats.failureSamples.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const method = (): PaymentMethod =>
    rng.weighted([
      ["UPI", 45],
      ["CASH", 25],
      ["CARD", 25],
      ["NET_BANKING", 5],
    ] as const);

  /* ----------------------------- patients ---------------------------- */

  const phone = () =>
    `${rng.pick(["9", "8", "7"])}${String(rng.int(100000000, 999999999))}`;

  const makePatientInput = (
    opts: { ageRange?: [number, number]; gender?: Gender } = {}
  ) => {
    const gender: Gender = opts.gender ?? (rng.chance(0.5) ? "MALE" : "FEMALE");
    const [minAge, maxAge] = opts.ageRange ?? [0, 85];
    const age = rng.int(minAge, maxAge);
    const dob = addDays(today, -Math.round(age * 365.25) - rng.int(1, 360));
    const first =
      gender === "MALE"
        ? rng.pick(FIRST_NAMES_MALE)
        : rng.pick(FIRST_NAMES_FEMALE);
    const last = rng.pick(LAST_NAMES);
    const locality = rng.pick(LOCALITIES);
    const guardian =
      age < 18
        ? `${rng.pick(FIRST_NAMES_MALE)} ${last}`
        : `${rng.pick(gender === "MALE" ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE)} ${last}`;
    return {
      firstName: first,
      lastName: last,
      gender,
      dateOfBirth: isoDate(dob),
      bloodGroup: rng.weighted([
        ["O+", 35],
        ["B+", 30],
        ["A+", 20],
        ["AB+", 7],
        ["O-", 3],
        ["B-", 2],
        ["A-", 2],
        ["AB-", 1],
      ] as const),
      phone: phone(),
      email: rng.chance(0.55)
        ? `${first}.${last}${rng.int(1, 99)}`
            .toLowerCase()
            .replace(/[^a-z0-9.]/g, "") + "@example.com"
        : undefined,
      address: `${rng.pick(["Flat", "House", "Bungalow", "Row house"])} ${rng.int(1, 60)}, ${rng.pick(["Sai", "Shree", "Green", "Royal", "Lotus", "Silver"])} ${rng.pick(["Residency", "Park", "Heights", "Enclave", "Apartments"])}, ${locality}`,
      city: "Pune",
      emergencyContactName: guardian,
      emergencyContactPhone: phone(),
      allergies: rng.chance(0.14) ? [rng.pick(ALLERGIES)] : [],
      chronicConditions:
        age > 40 && rng.chance(0.35) ? rng.sample(CHRONIC, rng.int(1, 2)) : [],
    };
  };

  const register = (
    at: Date,
    opts: Parameters<typeof makePatientInput>[0] = {}
  ) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return patients.registerPatient(
          tx(at, pickStaff(receptionists, at).id),
          makePatientInput(opts)
        );
      } catch {
        // duplicate name + phone + DOB — draw again
      }
    }
    return undefined;
  };

  for (let i = 0; i < 150; i += 1) {
    const at = addMinutes(
      addDays(today, -rng.int(HISTORY_DAYS + 5, 700)),
      rng.int(9 * 60, 18 * 60)
    );
    const ageBand = rng.weighted([
      [[0, 12], 14],
      [[13, 30], 20],
      [[31, 50], 30],
      [[51, 70], 26],
      [[71, 88], 10],
    ] as const);
    register(at, { ageRange: [ageBand[0], ageBand[1]] });
  }
  // Registration order drives UHIDs; keep the table chronological.
  db.patients.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));

  const age = (p: Patient) =>
    Math.floor(
      (today.getTime() - new Date(p.dateOfBirth).getTime()) / (365.25 * DAY)
    );
  const inHouse = (patientId: ID) =>
    db.admissions.some(a => a.patientId === patientId && ipd.isInHouse(a));

  const fits = (tpl: ConditionTemplate, p: Patient) =>
    (!tpl.gender || tpl.gender === p.gender) &&
    (!tpl.ageRange ||
      (age(p) >= tpl.ageRange[0] && age(p) <= tpl.ageRange[1])) &&
    (tpl.dept !== "PED" || age(p) <= 14) &&
    (tpl.dept === "PED" ||
      age(p) > 14 ||
      tpl.dept === "ENT" ||
      tpl.dept === "DER");

  const patientFor = (
    tpl: ConditionTemplate,
    at: Date,
    allowNew = 0.2
  ): Patient | undefined => {
    if (!rng.chance(allowNew)) {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const candidate = rng.pick(db.patients);
        if (fits(tpl, candidate) && !inHouse(candidate.id)) return candidate;
      }
    }
    const range: [number, number] =
      tpl.ageRange ?? (tpl.dept === "PED" ? [1, 12] : [18, 75]);
    return register(addMinutes(at, -5), {
      ageRange: range,
      gender: tpl.gender,
    });
  };

  const conditionsFor = (
    deptCode: string,
    kind: "outpatient" | "inpatient" | "any"
  ) =>
    CONDITIONS.filter(
      c =>
        c.dept === deptCode &&
        (kind === "any" ||
          (kind === "inpatient" ? Boolean(c.inpatient) : !c.inpatient))
    );

  const pickCondition = (
    deptCode: string,
    kind: "outpatient" | "inpatient" | "any" = "any"
  ) => {
    const pool = conditionsFor(deptCode, kind);
    const options = pool.length ? pool : conditionsFor(deptCode, "any");
    return rng.weighted(options.map(c => [c, c.weight] as const));
  };

  /* ------------------------------ stock ------------------------------ */

  const receive = (
    at: Date,
    code: string,
    quantity: number,
    expiryDays: number
  ) => {
    const med = medByCode.get(code)!;
    const index = db.medicines.indexOf(med);
    try {
      pharmacy.receiveStock(tx(at, pharmacists[0]!.id), {
        medicineId: med.id,
        // Each medicine comes from one regular distributor.
        supplier: SUPPLIERS[index % SUPPLIERS.length]!,
        invoiceNumber: `SI/${isoDate(at).slice(2, 7).replace("-", "")}/${String(4100 + index * 7).padStart(5, "0")}`,
        batchNumber: `${code.slice(0, 3)}${isoDate(at).replace(/-/g, "").slice(2, 6)}${rng.int(10, 99)}`,
        expiryDate: isoDate(addDays(at, expiryDays)),
        quantity,
        costPrice: Math.round(med.unitPrice * 0.62 * 100) / 100,
      });
    } catch (error) {
      fail("stock receipt", error);
    }
  };

  const openingDay = addMinutes(addDays(today, -HISTORY_DAYS - 2), 10 * 60);
  for (const m of MEDICINES) {
    const firstBatch = Math.round(m.opening * 0.4);
    receive(addDays(openingDay, -40), m.code, firstBatch, rng.int(90, 200));
    receive(openingDay, m.code, m.opening - firstBatch, rng.int(300, 700));
  }
  // A batch close to expiry and one already expired, for the pharmacy views.
  receive(addDays(today, -60), "LEV500", 24, 70);
  receive(addDays(today, -200), "MOXED", 12, 190);
  const SHORT = new Set(["LEV500", "INSGL"]);
  for (const d of [-25, -18, -11, -4]) {
    schedule(addMinutes(addDays(today, d), 11 * 60), "replenish", at => {
      const iso = isoDate(at);
      for (const m of MEDICINES) {
        if (SHORT.has(m.code)) continue;
        const med = medByCode.get(m.code)!;
        if (pharmacy.stockOnHand(db, med.id, iso) < m.reorder * 3)
          receive(at, m.code, m.reorder * 6, rng.int(300, 600));
      }
    });
  }

  /* ------------------------------ billing ---------------------------- */

  const settle = (
    at: Date,
    where: { encounterId?: ID; admissionId?: ID },
    share = 1
  ) => {
    const actor = pickStaff(billers, at).id;
    const bills = db.invoices.filter(
      inv =>
        inv.status !== "CANCELLED" &&
        inv.status !== "DRAFT" &&
        ((where.encounterId && inv.encounterId === where.encounterId) ||
          (where.admissionId && inv.admissionId === where.admissionId))
    );
    for (const bill of bills) {
      const { balance } = billing.invoiceTotals(db, bill.id);
      if (balance <= 0) continue;
      const amount = share >= 1 ? balance : Math.round(balance * share);
      if (amount <= 0) continue;
      try {
        billing.recordPayment(tx(at, actor), bill.id, {
          amount,
          method: method(),
          reference: rng.chance(0.6) ? `TXN${rng.int(10000000, 99999999)}` : "",
        });
      } catch (error) {
        fail("payment", error);
      }
    }
  };

  /* ------------------------------- labs ------------------------------ */

  const BIAS: Record<string, Record<string, "low" | "high" | string>> = {
    A90: {
      "Platelet count": "low",
      "NS1 antigen": "Positive",
      "Total WBC count": "low",
    },
    "E11.9": {
      "Fasting glucose": "high",
      "Post-prandial glucose": "high",
      HbA1c: "high",
    },
    I10: { "Total cholesterol": "high", "LDL cholesterol": "high" },
    "I21.4": { "Troponin I": "high", "LDL cholesterol": "high" },
    "I50.9": {
      "Serum creatinine": "high",
      "Blood urea": "high",
      Sodium: "low",
    },
    "J18.9": { "Total WBC count": "high", CRP: "high" },
    "K35.8": { "Total WBC count": "high", CRP: "high" },
    "E03.9": { TSH: "high" },
    "N93.9": { Haemoglobin: "low" },
    "R50.9": { "Total WBC count": "low" },
    A09: { Potassium: "low", Sodium: "low" },
    "M17.9": { ESR: "high" },
  };

  const genValue = (
    p: (typeof db.labTests)[number]["parameters"][number],
    icd: string
  ): string => {
    const bias = BIAS[icd]?.[p.name];
    if (p.options?.length) {
      if (bias && bias !== "low" && bias !== "high" && rng.chance(0.8))
        return bias;
      return rng.chance(0.93)
        ? (p.refText ?? p.options[0]!)
        : rng.pick(p.options.filter(o => o !== p.refText));
    }
    const low = p.refLow ?? 0;
    const high = p.refHigh ?? low + 1;
    const span = high - low || 1;
    const digits = span < 2 ? 2 : span < 20 ? 1 : 0;
    let value: number;
    const roll = rng.next();
    if (bias === "high" && rng.chance(0.8))
      value = high + span * rng.float(0.1, 0.9, 3);
    else if (bias === "low" && rng.chance(0.8))
      value = low - span * rng.float(0.1, 0.45, 3);
    else if (roll < 0.78) value = low + span * rng.float(0.1, 0.9, 3);
    else if (roll < 0.89) value = high + span * rng.float(0.03, 0.3, 3);
    else if (roll < 0.985) value = low - span * rng.float(0.03, 0.2, 3);
    else value = p.criticalHigh ?? high * 2;
    value = Math.max(0, value);
    return value.toFixed(digits);
  };

  const runLab = (orderId: ID, orderedAt: Date, icd: string) => {
    const order = find(db.labOrders, orderId)!;
    const fast = order.priority !== "ROUTINE";
    let t = addMinutes(orderedAt, rng.int(5, fast ? 10 : 25));
    if (!fast && rng.chance(0.55)) {
      const requestAt = t;
      schedule(requestAt, "lab sample request", at =>
        lab.requestSample(tx(at, pickStaff(labTechs, at).id), orderId)
      );
      t = addMinutes(t, rng.int(10, 40));
    }
    const collectAt = t;
    schedule(collectAt, "lab collect", at =>
      lab.collectSample(tx(at, pickStaff(labTechs, at).id), orderId)
    );
    const processAt = addMinutes(collectAt, rng.int(10, fast ? 20 : 45));
    schedule(processAt, "lab process", at =>
      lab.startProcessing(tx(at, pickStaff(labTechs, at).id), orderId)
    );
    const tat = lab.expectedTatHours(db, order);
    const resultAt = addMinutes(
      processAt,
      Math.max(20, Math.round(tat * 60 * rng.float(0.35, 0.95, 2)))
    );
    schedule(resultAt, "lab result", at => {
      const values: Record<ID, Record<ID, string>> = {};
      for (const { item, test } of lab.labOrderTests(db, orderId)) {
        values[item.id] = Object.fromEntries(
          test.parameters.map(p => [p.id, genValue(p, icd)])
        );
      }
      lab.enterResults(tx(at, pickStaff(labTechs, at).id), orderId, values);
    });
    const verifyAt = addMinutes(resultAt, rng.int(10, fast ? 25 : 70));
    schedule(verifyAt, "lab verify", at =>
      lab.verifyResults(tx(at, labTechs[0]!.id), orderId)
    );
  };

  const orderLabs = (
    at: Date,
    actorId: ID,
    encounterId: ID,
    codes: string[],
    icd: string,
    priority: "ROUTINE" | "URGENT" | "STAT" = "ROUTINE"
  ) => {
    if (!codes.length) return;
    const testIds = codes.map(c => testByCode.get(c)!.id);
    const order = lab.createLabOrder(tx(at, actorId), {
      encounterId,
      testIds,
      priority,
      clinicalNotes: "",
    });
    runLab(order.id, at, icd);
  };

  /* ----------------------------- pharmacy ---------------------------- */

  const safeMeds = (patient: Patient, meds: MedTemplate[]) =>
    meds.filter(m => {
      const med = medByCode.get(m.code)!;
      return !patient.allergies.some(a =>
        [med.name, med.genericName, med.category].some(v =>
          v.toLowerCase().includes(a.toLowerCase())
        )
      );
    });

  const prescribe = (
    at: Date,
    actorId: ID,
    encounterId: ID,
    patient: Patient,
    meds: MedTemplate[],
    isDischarge = false
  ) => {
    const lines = safeMeds(patient, meds);
    if (!lines.length) return undefined;
    return pharmacy.createPrescription(tx(at, actorId), {
      encounterId,
      isDischargeMedication: isDischarge,
      items: lines.map(m => {
        const med = medByCode.get(m.code)!;
        return {
          medicineId: med.id,
          dose: m.dose,
          frequency: m.frequency,
          route: m.route,
          durationDays: m.days,
          quantity: pharmacy.suggestQuantity(med, m.frequency, m.days),
          instructions: m.instructions,
        };
      }),
    });
  };

  const dispenseAll = (at: Date, prescriptionId: ID, partial = false) => {
    const items = db.prescriptionItems.filter(
      i => i.prescriptionId === prescriptionId && i.status !== "CANCELLED"
    );
    const lines = items
      .map((item, index) => {
        const remaining = item.quantityPrescribed - item.quantityDispensed;
        const available = pharmacy.stockOnHand(
          db,
          item.medicineId,
          isoDate(at)
        );
        let qty = Math.min(remaining, available);
        if (partial && index === 0)
          qty = Math.min(qty, Math.max(1, Math.floor(remaining / 2)));
        return { itemId: item.id, quantity: qty };
      })
      .filter(l => l.quantity > 0);
    if (!lines.length) return;
    pharmacy.dispense(
      tx(at, pickStaff(pharmacists, at).id),
      prescriptionId,
      lines
    );
  };

  /* ------------------------------ feedback --------------------------- */

  const FEEDBACK_TEXT: Record<number, string[]> = {
    5: [
      "Doctor explained everything patiently. Very satisfied.",
      "Excellent nursing care, staff were very kind.",
      "Quick service and clean facility.",
      "Smooth experience from registration to pharmacy.",
    ],
    4: [
      "Good consultation, slight wait at the billing counter.",
      "Staff were helpful. Parking is difficult.",
      "Overall good, pharmacy queue could be faster.",
    ],
    3: [
      "Waited almost an hour beyond my appointment time.",
      "Treatment was fine but the room was not cleaned on time.",
      "Billing took too long at discharge.",
    ],
    2: [
      "Long waiting time and nobody updated us.",
      "Food was cold and served late.",
      "Discharge process took the whole day.",
    ],
    1: [
      "Very poor coordination at the front desk.",
      "Staff at the counter were rude. Nobody explained the bill.",
    ],
  };

  const giveFeedback = (
    at: Date,
    patientId: ID,
    encounterId: ID,
    deptId: ID,
    doctorId: ID,
    inpatient: boolean
  ) => {
    const rating = rng.weighted([
      [5, 40],
      [4, 34],
      [3, 13],
      [2, 8],
      [1, 5],
    ] as const);
    const pool: FeedbackCategory[] = inpatient
      ? [
          "NURSING_CARE",
          "CLEANLINESS",
          "FOOD",
          "BILLING",
          "DOCTOR_CONSULTATION",
        ]
      : [
          "DOCTOR_CONSULTATION",
          "WAITING_TIME",
          "FRONT_DESK",
          "PHARMACY",
          "LAB",
          "BILLING",
        ];
    const anonymous = rng.chance(0.15);
    const fb = quality.submitFeedback(tx(at, pickStaff(receptionists, at).id), {
      patientId,
      anonymous,
      encounterId,
      departmentId: deptId,
      doctorId,
      rating,
      categories: rng.sample(pool, rng.int(1, 3)),
      comments: rng.pick(FEEDBACK_TEXT[rating]!),
      channel: rng.pick(["KIOSK", "SMS_LINK", "IN_PERSON", "EMAIL"] as const),
    });
    if (fb.followUpRequired) {
      schedule(addDays(at, 1), "feedback follow-up", t =>
        quality.updateFeedbackFollowUp(tx(t, opsManagers[1]!.id), fb.id, {
          status: "IN_PROGRESS",
          note: "Called the patient; concern acknowledged.",
        })
      );
      if (rng.chance(0.7)) {
        schedule(
          addMinutes(addDays(at, rng.int(2, 3)), 30),
          "feedback close",
          t =>
            quality.updateFeedbackFollowUp(tx(t, opsManagers[1]!.id), fb.id, {
              status: "COMPLETED",
              note: "Apologised and shared corrective action with the department head.",
            })
        );
      }
    }
  };

  /* ------------------------------- OPD ------------------------------- */

  const slotsFor = (doctor: Staff, date: Date): Date[] => {
    const row = rosterIndex.get(`${doctor.id}|${isoDate(date)}`);
    if (row?.status !== "SCHEDULED" || !row.shift) return [];
    const ranges: Array<[number, number]> =
      row.shift === "M"
        ? [[9 * 60, 13 * 60 + 45]]
        : row.shift === "E"
          ? [[15 * 60, 19 * 60 + 45]]
          : [
              [9 * 60 + 30, 12 * 60 + 45],
              [14 * 60, 16 * 60 + 45],
            ];
    const out: Date[] = [];
    for (const [from, to] of ranges)
      for (let m = from; m <= to; m += 15)
        out.push(addMinutes(startOfDay(date), m));
    return out;
  };

  const freeSlot = (doctor: Staff, date: Date, notBefore: Date) => {
    const taken = new Set(
      db.appointments
        .filter(
          a =>
            a.doctorId === doctor.id &&
            a.status !== "CANCELLED" &&
            a.status !== "NO_SHOW" &&
            isoDate(a.scheduledAt) === isoDate(date)
        )
        .map(a => a.scheduledAt)
    );
    const options = slotsFor(doctor, date).filter(
      s => s > notBefore && !taken.has(s.toISOString())
    );
    return options.length ? rng.pick(options) : undefined;
  };

  const doctorFree = new Map<string, number>();

  /** Arrival → queue → consultation → orders → closure → pharmacy & billing. */
  const scheduleVisit = (appointmentId: ID, tpl: ConditionTemplate) => {
    const apt = find(db.appointments, appointmentId)!;
    const when = new Date(apt.scheduledAt);
    const doctor = find(db.staff, apt.doctorId)!;

    if (apt.source !== "WALK_IN") {
      if (rng.chance(0.04)) {
        const cancelAt = addMinutes(when, -rng.int(90, 600));
        if (cancelAt > new Date(apt.createdAt)) {
          schedule(cancelAt, "appointment cancel", at =>
            opd.cancelAppointment(
              tx(at, pickStaff(receptionists, at).id),
              appointmentId,
              rng.pick([
                "Patient unwell to travel",
                "Rescheduling later",
                "Personal emergency",
              ])
            )
          );
          return;
        }
      }
      if (rng.chance(0.07)) {
        schedule(addMinutes(when, 75), "no-show", at =>
          opd.markNoShow(tx(at, pickStaff(receptionists, at).id), appointmentId)
        );
        return;
      }
    }

    const arrive =
      apt.source === "WALK_IN" ? when : addMinutes(when, rng.int(-15, 20));
    schedule(arrive, "check-in", at => {
      const current = find(db.appointments, appointmentId)!;
      if (current.status !== "SCHEDULED") return;
      const encounter = opd.checkIn(
        tx(at, pickStaff(receptionists, at).id),
        appointmentId
      );
      const patient = find(db.patients, encounter.patientId)!;
      if (rng.chance(0.97))
        schedule(addMinutes(at, 2), "consult payment", t =>
          settle(t, { encounterId: encounter.id })
        );
      if (rng.chance(0.96)) {
        schedule(addMinutes(at, rng.int(3, 12)), "vitals", t => {
          const years = age(patient);
          const child = years < 12;
          opd.recordVitals(tx(t, pickStaff(nurses, t).id), encounter.id, {
            temperatureC: rng.float(
              36.4,
              tpl.icd === "R50.9" || tpl.icd === "B34.9" ? 39.2 : 37.6
            ),
            pulse: rng.int(child ? 88 : 64, child ? 128 : 102),
            systolic: child
              ? undefined
              : rng.int(
                  tpl.icd === "I10" ? 140 : 104,
                  tpl.icd === "I10" ? 168 : 138
                ),
            diastolic: child
              ? undefined
              : rng.int(
                  tpl.icd === "I10" ? 88 : 66,
                  tpl.icd === "I10" ? 104 : 88
                ),
            respiratoryRate: rng.int(child ? 20 : 14, child ? 34 : 20),
            spo2: rng.int(tpl.inpatient ? 90 : 96, 99),
            weightKg: child
              ? Math.round((8 + years * 2.6 + rng.float(-1.5, 2.5)) * 10) / 10
              : rng.float(48, 92),
            heightCm: child
              ? Math.round(75 + years * 6 + rng.int(-4, 5))
              : rng.int(150, 182),
          });
        });
      }

      const dayKey = `${doctor.id}|${isoDate(at)}`;
      const start = new Date(
        Math.max(
          addMinutes(at, rng.int(8, 14)).getTime(),
          doctorFree.get(dayKey) ?? 0
        )
      );
      const duration = rng.int(8, 16);
      doctorFree.set(dayKey, addMinutes(start, duration).getTime());

      schedule(start, "consultation", t => {
        const docTx = tx(t, doctor.id);
        opd.startConsultation(docTx, appointmentId);
        const followUp =
          !tpl.inpatient && rng.chance(0.25)
            ? isoDate(addDays(t, rng.pick([7, 10, 14, 30])))
            : undefined;
        const referred = !tpl.inpatient && !followUp && rng.chance(0.04);
        opd.saveConsultation(docTx, encounter.id, {
          chiefComplaint: tpl.complaint,
          history: tpl.history,
          examination: tpl.exam,
          diagnoses: [
            { code: tpl.icd, description: tpl.diagnosis, type: "PRIMARY" },
          ],
          consultationNotes: `Assessment: ${tpl.diagnosis}. ${tpl.labs.length ? `Investigations advised: ${tpl.labs.map(c => testByCode.get(c)!.name).join(", ")}.` : "No investigations needed today."}`,
          advice: tpl.advice,
          followUpDate: followUp,
          referral: referred
            ? {
                toDepartmentId: dept(rng.pick(["CAR", "SUR", "ORT", "ENT"])),
                note: "Please evaluate and advise further management.",
              }
            : undefined,
        });
        if (tpl.labs.length && (tpl.inpatient || rng.chance(0.72))) {
          try {
            orderLabs(
              t,
              doctor.id,
              encounter.id,
              tpl.inpatient
                ? tpl.labs
                : tpl.labs.slice(0, rng.int(1, tpl.labs.length)),
              tpl.icd,
              tpl.inpatient ? "URGENT" : rng.chance(0.1) ? "URGENT" : "ROUTINE"
            );
          } catch (error) {
            fail("opd lab order", error);
          }
        }
        let rxId: ID | undefined;
        if (tpl.meds.length) {
          try {
            rxId = prescribe(t, doctor.id, encounter.id, patient, tpl.meds)?.id;
          } catch (error) {
            fail("opd prescription", error);
          }
        }

        const closeAt = addMinutes(t, duration);
        schedule(closeAt, "visit closure", tc => {
          const disposition = tpl.inpatient
            ? "ADMISSION_ADVISED"
            : followUp
              ? "FOLLOW_UP"
              : referred
                ? "REFERRED"
                : "SENT_HOME";
          opd.completeVisit(tx(tc, doctor.id), encounter.id, disposition);

          if (rng.chance(0.97))
            schedule(addMinutes(tc, rng.int(5, 20)), "opd payment", tp =>
              settle(tp, { encounterId: encounter.id })
            );

          if (rxId) {
            const pending = rxId;
            schedule(addMinutes(tc, 22 * 60), "close uncollected", tu => {
              const rx = find(db.prescriptions, pending)!;
              if (
                rx.status === "PENDING" ||
                rx.status === "PARTIALLY_DISPENSED"
              ) {
                pharmacy.closeUncollected(
                  tx(tu, pickStaff(pharmacists, tu).id),
                  pending,
                  "Not collected — patient purchased outside"
                );
              }
            });
          }
          if (rxId && rng.chance(0.88)) {
            const dispenseAt = addMinutes(tc, rng.int(10, 45));
            const id = rxId;
            schedule(dispenseAt, "opd dispense", td => {
              dispenseAll(td, id, rng.chance(0.06));
              if (rng.chance(0.985))
                schedule(
                  addMinutes(td, rng.int(2, 6)),
                  "pharmacy payment",
                  tp => settle(tp, { encounterId: encounter.id })
                );
              if (rng.chance(0.03)) {
                schedule(addDays(td, 1), "medicine return", tr => {
                  const item = db.prescriptionItems.find(
                    i =>
                      i.prescriptionId === id &&
                      i.quantityDispensed - i.quantityReturned > 1
                  );
                  if (!item) return;
                  pharmacy.returnMedicine(
                    tx(tr, pickStaff(pharmacists, tr).id),
                    item.id,
                    Math.min(2, item.quantityDispensed - item.quantityReturned),
                    "Unopened strip returned by patient"
                  );
                  schedule(addMinutes(tr, 10), "refund", tf => {
                    for (const bill of db.invoices.filter(
                      b => b.encounterId === encounter.id
                    )) {
                      const { refundDue } = billing.invoiceTotals(db, bill.id);
                      if (refundDue > 0)
                        billing.recordRefund(
                          tx(tf, pickStaff(billers, tf).id),
                          bill.id,
                          {
                            amount: refundDue,
                            method: "CASH",
                            reason: "Refund for returned medicine",
                          }
                        );
                    }
                  });
                });
              }
            });
          }

          if (followUp && rng.chance(0.8)) {
            schedule(addMinutes(tc, 4), "follow-up booking", tb => {
              const date = startOfDay(new Date(followUp));
              const slot = freeSlot(doctor, date, tb);
              if (!slot) return;
              const booked = opd.bookAppointment(
                tx(tb, pickStaff(receptionists, tb).id),
                {
                  patientId: patient.id,
                  doctorId: doctor.id,
                  scheduledAt: slot.toISOString(),
                  type: "FOLLOW_UP",
                  source: "FOLLOW_UP",
                  reason: `Follow-up: ${tpl.diagnosis}`,
                }
              );
              scheduleVisit(
                booked.id,
                tpl.inpatient ? pickCondition(tpl.dept, "outpatient") : tpl
              );
            });
          }

          if (tpl.inpatient) {
            schedule(
              addMinutes(tc, rng.int(30, 90)),
              "admission from OPD",
              ta => admit(ta, patient, doctor, tpl, "OPD", encounter.id)
            );
          } else if (rng.chance(0.1)) {
            schedule(addMinutes(tc, rng.int(60, 240)), "feedback", tf =>
              giveFeedback(
                tf,
                patient.id,
                encounter.id,
                encounter.departmentId,
                doctor.id,
                false
              )
            );
          }
        });
      });
    });
  };

  const book = (
    at: Date,
    patient: Patient,
    doctor: Staff,
    slot: Date,
    tpl: ConditionTemplate,
    type: "NEW" | "FOLLOW_UP" = "NEW"
  ) => {
    const apt = opd.bookAppointment(tx(at, pickStaff(receptionists, at).id), {
      patientId: patient.id,
      doctorId: doctor.id,
      scheduledAt: slot.toISOString(),
      type,
      source: rng.chance(0.55) ? "PHONE" : "ONLINE",
      reason: tpl.complaint,
    });
    scheduleVisit(apt.id, tpl);
    return apt;
  };

  /* ------------------------------- IPD ------------------------------- */

  const WARD_PREF: Record<string, string[]> = {
    HDU: ["HDU", "SPV", "PVT"],
    PAE: ["PAE", "SPV"],
  };

  const pickBed = (patient: Patient, tpl: ConditionTemplate) => {
    const pref = tpl.inpatient?.ward
      ? (WARD_PREF[tpl.inpatient.ward] ?? [tpl.inpatient.ward])
      : age(patient) <= 12
        ? ["PAE", "SPV"]
        : rng.weighted([
            [[patient.gender === "MALE" ? "GWM" : "GWF", "SPV", "PVT"], 65],
            [["SPV", "PVT", patient.gender === "MALE" ? "GWM" : "GWF"], 22],
            [["PVT", "SPV", patient.gender === "MALE" ? "GWM" : "GWF"], 13],
          ] as const);
    for (const code of pref) {
      const ward = db.wards.find(w => w.code === code)!;
      const inWard = db.beds.filter(
        b => db.rooms.find(r => r.id === b.roomId)?.wardId === ward.id
      );
      const beds = inWard.filter(b => b.status === "AVAILABLE");
      // Bed management keeps ~15% of a general ward free for emergencies;
      // planned admissions go to the next preferred ward or wait.
      const reserve =
        code === "HDU" ? 0 : Math.max(1, Math.round(inWard.length * 0.15));
      if (beds.length > reserve) return rng.pick(beds);
    }
    return undefined;
  };

  const admit = (
    at: Date,
    patient: Patient,
    doctor: Staff,
    tpl: ConditionTemplate,
    source: "OPD" | "DIRECT" | "REFERRAL",
    sourceEncounterId?: ID
  ) => {
    const course = tpl.inpatient!;
    if (inHouse(patient.id)) return;
    const bed = pickBed(patient, tpl);
    if (!bed) {
      fail(
        "admission (no bed free)",
        new Error(`No ${tpl.inpatient?.ward ?? "ward"} bed free`)
      );
      return;
    }
    const stay = rng.int(course.stay[0], course.stay[1]);
    const admission = ipd.admitPatient(
      tx(at, pickStaff(receptionists, at).id),
      {
        patientId: patient.id,
        doctorId: doctor.id,
        bedId: bed.id,
        reason: tpl.complaint,
        provisionalDiagnosis: tpl.diagnosis,
        source,
        sourceEncounterId,
        expectedDischargeDate: isoDate(addDays(at, stay)),
      }
    );
    scheduleStay(admission, at, stay, patient, doctor, tpl);
  };

  const alive = (admissionId: ID) => {
    const a = find(db.admissions, admissionId);
    return a && ipd.isInHouse(a) ? a : undefined;
  };

  const releaseBedLater = (at: Date, bedId: ID) => {
    schedule(addMinutes(at, rng.int(60, 180)), "bed cleaned", t => {
      const bed = find(db.beds, bedId)!;
      if (bed.status === "CLEANING")
        ipd.setBedHousekeeping(tx(t, support[0]!.id), bedId, "AVAILABLE");
    });
  };

  const scheduleStay = (
    admission: Admission,
    at: Date,
    stay: number,
    patient: Patient,
    doctor: Staff,
    tpl: ConditionTemplate
  ) => {
    const course = tpl.inpatient!;
    const id = admission.id;
    const encounterId = admission.encounterId;

    if (rng.chance(0.92)) {
      schedule(addMinutes(at, rng.int(15, 60)), "consent form", t => {
        const fileName = `consent-${admission.code.toLowerCase()}.pdf`;
        const sizeKb = rng.int(220, 640);
        // The last fortnight's consent forms are scanned in; older ones are
        // paper originals in the case file.
        const scanned = today.getTime() - at.getTime() < 14 * DAY;
        mrd.addDocument(tx(t, pickStaff(nurses, t).id), {
          patientId: patient.id,
          encounterId,
          admissionId: id,
          title: "General consent for admission & treatment",
          kind: "CONSENT_FORM",
          ...(scanned
            ? {
                file: {
                  name: fileName,
                  data: consentFormScan({
                    hospital: HOSPITAL.name,
                    patient: `${patient.firstName} ${patient.lastName}`,
                    uhid: patient.uhid,
                    admissionCode: admission.code,
                    date: isoDate(t),
                    doctor: `Dr ${doctor.firstName} ${doctor.lastName}`,
                  }),
                },
              }
            : { fileName, sizeKb }),
        });
      });
    }
    schedule(addMinutes(at, rng.int(25, 50)), "admission note", t => {
      if (!alive(id)) return;
      ipd.addClinicalNote(tx(t, doctor.id), id, {
        type: "ADMISSION",
        text: `${patient.firstName} ${patient.lastName}, ${age(patient)} y, admitted with ${tpl.complaint.toLowerCase()}. ${tpl.exam} Provisional diagnosis: ${tpl.diagnosis}. Plan: ${course.ivMeds.length ? "IV therapy as charted" : "supportive care"}, monitoring, investigations.`,
      });
      ipd.addCareOrder(tx(t, doctor.id), id, {
        type: "DIET",
        instruction: course.diet,
      });
      ipd.addCareOrder(tx(t, doctor.id), id, {
        type: "MONITORING",
        instruction:
          tpl.inpatient?.ward === "HDU"
            ? "Vitals and SpO₂ hourly, strict intake-output charting"
            : "Vitals 4-hourly, intake-output charting",
      });
      if (rng.chance(0.5))
        ipd.addCareOrder(tx(t, doctor.id), id, {
          type: "ACTIVITY",
          instruction: rng.pick([
            "Bed rest",
            "Ambulate with assistance",
            "Head end elevation 30°",
          ]),
        });
      try {
        orderLabs(
          t,
          doctor.id,
          encounterId,
          tpl.labs.length ? tpl.labs : ["CBC", "KFT"],
          tpl.icd,
          tpl.inpatient?.ward === "HDU" ? "STAT" : "URGENT"
        );
      } catch (error) {
        fail("ipd lab order", error);
      }
      let rxId: ID | undefined;
      try {
        rxId = prescribe(t, doctor.id, encounterId, patient, course.ivMeds)?.id;
      } catch (error) {
        fail("ipd prescription", error);
      }
      if (rxId) {
        const rid = rxId;
        schedule(addMinutes(t, rng.int(30, 120)), "ipd dispense", td =>
          dispenseAll(td, rid)
        );
      }
    });

    if (course.procedure) {
      const procAt =
        stay > 1
          ? atTime(addDays(startOfDay(at), 1), rng.int(10, 15), rng.int(0, 59))
          : addMinutes(at, 180);
      schedule(procAt, "procedure charge", t => {
        const a = alive(id);
        if (!a) return;
        const bill = billing.openInvoiceFor(tx(t, pickStaff(billers, t).id), {
          patientId: a.patientId,
          encounterId,
          admissionId: id,
        });
        billing.addManualCharge(tx(t, pickStaff(billers, t).id), bill.id, {
          category: "PROCEDURE",
          description: course.procedure!.name,
          quantity: 1,
          unitPrice: course.procedure!.charge,
        });
        ipd.addClinicalNote(tx(addMinutes(t, 5), doctor.id), id, {
          type: "PROCEDURE",
          text: `${course.procedure!.name.split(" — ")[0]} performed. Patient shifted back to ward in stable condition.`,
        });
      });
    }

    for (let k = 1; k < stay; k += 1) {
      const day = addDays(startOfDay(at), k);
      schedule(
        atTime(day, rng.int(9, 11), rng.int(0, 59)),
        "progress note",
        t => {
          if (!alive(id)) return;
          ipd.addClinicalNote(tx(t, doctor.id), id, {
            type: "PROGRESS",
            text: rng.pick([
              `Day ${k}: Afebrile, vitals stable. Tolerating orally. Continue current treatment.`,
              `Day ${k}: Symptomatically better. Chest clear, abdomen soft. Plan as charted.`,
              `Day ${k}: Mild discomfort overnight, settled with analgesics. Review labs.`,
              `Day ${k}: Improving. Encouraged mobilisation. Plan discharge in ${Math.max(1, stay - k)} day(s).`,
            ]),
          });
          if (k === 2 && rng.chance(0.5)) {
            try {
              orderLabs(t, doctor.id, encounterId, ["CBC"], tpl.icd);
            } catch (error) {
              fail("ipd repeat lab", error);
            }
          }
        }
      );
      {
        schedule(
          atTime(day, rng.pick([7, 19]), rng.int(0, 45)),
          "nursing note",
          t => {
            if (!alive(id)) return;
            ipd.addClinicalNote(tx(t, pickStaff(nurses, t).id), id, {
              type: "NURSING",
              text: rng.pick([
                "Vitals within normal limits. IV line patent. Medications given as charted.",
                "Patient slept well. Intake adequate. No fresh complaints.",
                "Pain score 3/10. Positioned comfortably. Attendant counselled.",
                "Temperature spike 100.2 °F at 04:00, paracetamol given, doctor informed.",
              ]),
            });
          }
        );
      }
    }

    if (stay >= 2 && rng.chance(0.5)) {
      schedule(
        atTime(addDays(startOfDay(at), 1), 16, rng.int(0, 59)),
        "interim payment",
        t => {
          const a = alive(id);
          if (!a) return;
          const bill = db.invoices.find(
            b => b.admissionId === id && b.status === "DRAFT"
          );
          if (!bill) return;
          const { balance } = billing.invoiceTotals(db, bill.id);
          if (balance > 1000)
            billing.recordPayment(tx(t, pickStaff(billers, t).id), bill.id, {
              amount: Math.round(balance * 0.6),
              method: method(),
              reference: "Advance deposit",
            });
        }
      );
    }

    // Step-down or upgrade transfer mid-stay.
    const inHdu = tpl.inpatient?.ward === "HDU";
    if (stay >= 3 && (inHdu ? rng.chance(0.6) : rng.chance(0.06))) {
      const requestAt = atTime(
        addDays(startOfDay(at), inHdu ? 2 : 1),
        11,
        rng.int(0, 50)
      );
      schedule(requestAt, "transfer request", t => {
        const a = alive(id);
        if (!a || (a.status !== "ACTIVE" && a.status !== "ADMITTED")) return;
        const wards = inHdu
          ? [patient.gender === "MALE" ? "GWM" : "GWF", "SPV"]
          : ["PVT", "SPV"];
        const target = db.beds.find(
          b =>
            b.status === "AVAILABLE" &&
            wards.includes(
              db.wards.find(
                w => w.id === db.rooms.find(r => r.id === b.roomId)!.wardId
              )!.code
            )
        );
        if (!target) return;
        ipd.requestTransfer(tx(t, pickStaff(nurses, t).id), id, {
          toBedId: target.id,
          reason: inHdu
            ? "Stable — step-down to ward"
            : "Upgrade requested by family",
        });
        schedule(addMinutes(t, rng.int(45, 180)), "transfer complete", tt => {
          const current = ipd.currentAssignment(db, id);
          ipd.completeTransfer(tx(tt, pickStaff(nurses, tt).id), id);
          if (current) releaseBedLater(tt, current.bedId);
        });
      });
    }

    // Discharge day.
    const dday = addDays(startOfDay(at), stay);
    const initiateAt = atTime(dday, rng.int(9, 11), rng.int(0, 59));
    schedule(initiateAt, "initiate discharge", t => {
      const a = alive(id);
      if (!a) return;
      if (a.status === "TRANSFER_PENDING")
        ipd.completeTransfer(tx(t, pickStaff(nurses, t).id), id);
      ipd.initiateDischarge(tx(t, doctor.id), id);
      const summaryAt = addMinutes(t, rng.int(30, 75));
      schedule(summaryAt, "discharge summary", ts => {
        const rx = prescribe(
          ts,
          doctor.id,
          encounterId,
          patient,
          course.dischargeMeds,
          true
        );
        ipd.saveDischargeSummary(
          tx(ts, doctor.id),
          id,
          {
            finalDiagnosis: tpl.diagnosis,
            courseInHospital: course.course,
            proceduresDone: course.procedure
              ? course.procedure.name.split(" — ")[0]!
              : "Nil",
            conditionAtDischarge:
              "Stable, afebrile, ambulant, tolerating oral diet.",
            dischargeMedications: course.dischargeMeds
              .map(
                m =>
                  `${medByCode.get(m.code)!.name} ${medByCode.get(m.code)!.strength} — ${m.dose} ${m.frequency} × ${m.days} days`
              )
              .join("\n"),
            followUpInstructions: `Review in ${tpl.dept === "SUR" || tpl.dept === "ORT" ? "Surgery/Ortho" : "the"} OPD with reports. Return earlier if fever, pain or breathlessness.`,
            followUpDate: isoDate(addDays(ts, 7)),
          },
          true
        );
        if (rx) {
          schedule(addMinutes(ts, rng.int(15, 40)), "discharge dispense", td =>
            dispenseAll(td, rx.id)
          );
          schedule(addDays(ts, 1), "close uncollected", tu => {
            const current = find(db.prescriptions, rx.id)!;
            if (
              current.status === "PENDING" ||
              current.status === "PARTIALLY_DISPENSED"
            ) {
              pharmacy.closeUncollected(
                tx(tu, pickStaff(pharmacists, tu).id),
                rx.id,
                "Balance not collected after discharge"
              );
            }
          });
        }
        if (rng.chance(0.05)) {
          schedule(addMinutes(ts, 50), "ward return", tr => {
            const item = db.prescriptionItems.find(i => {
              const p = find(db.prescriptions, i.prescriptionId);
              return (
                p?.admissionId === id &&
                !p.isDischargeMedication &&
                i.quantityDispensed - i.quantityReturned >= 2
              );
            });
            if (item)
              pharmacy.returnMedicine(
                tx(tr, pickStaff(pharmacists, tr).id),
                item.id,
                2,
                "Unused ward stock returned at discharge"
              );
          });
        }
        const dischargeAt = addMinutes(ts, rng.int(90, 200));
        // Financial clearance first: the desk collects the final balance
        // (today's room and nursing included), or records approved dues.
        schedule(
          addMinutes(dischargeAt, -rng.int(20, 45)),
          "billing clearance",
          tb => {
            const a = alive(id);
            if (!a || a.status !== "DISCHARGE_PENDING") return;
            const desk = pickStaff(billers, tb).id;
            const bill = db.invoices.find(
              b => b.admissionId === id && b.status === "DRAFT"
            );
            const roll = rng.next();
            const share =
              roll < 0.86 ? 1 : roll < 0.95 ? rng.float(0.5, 0.8, 2) : 0;
            let due = ipd.dischargeClearance(db, a, tb).balance;
            if (bill && share > 0)
              while (due > 0.005) {
                const amount = Math.min(
                  billing.MAX_DEPOSIT,
                  share >= 1 ? due : Math.round(due * share)
                );
                if (amount <= 0) break;
                billing.recordPayment(tx(tb, desk), bill.id, {
                  amount,
                  method: method(),
                  reference: rng.chance(0.6)
                    ? `TXN${rng.int(10000000, 99999999)}`
                    : "Final settlement",
                });
                if (share < 1) break;
                due = ipd.dischargeClearance(db, a, tb).balance;
              }
            ipd.clearBilling(
              tx(tb, desk),
              id,
              share >= 1
                ? undefined
                : rng.pick([
                    "Cashless claim approved by the insurer; balance on TPA settlement",
                    "Corporate credit — employer settles monthly",
                    "Approved by the medical superintendent; family to pay on review",
                  ])
            );
          }
        );
        schedule(dischargeAt, "discharge", tdc => {
          const bedId = ipd.currentAssignment(db, id)?.bedId;
          ipd.dischargePatient(tx(tdc, pickStaff(nurses, tdc).id), id);
          if (bedId) releaseBedLater(tdc, bedId);
          if (rng.chance(0.35)) {
            schedule(addMinutes(tdc, rng.int(60, 180)), "feedback", tf =>
              giveFeedback(
                tf,
                patient.id,
                encounterId,
                admission.departmentId,
                doctor.id,
                true
              )
            );
          }
        });
      });
    });
  };

  /* ------------------------------ enquiries -------------------------- */

  const ENQUIRY_REASONS = [
    "Cost of knee replacement package",
    "Health check-up packages for parents",
    "Availability of cardiologist on Saturday",
    "Maternity package and delivery charges",
    "Paediatric vaccination schedule",
    "Second opinion for gallbladder surgery",
    "Physiotherapy after fracture",
  ];

  const clinicalDoctor = (deptCode: string) =>
    rng.pick(doctors.filter(d => d.departmentId === dept(deptCode)));

  const scheduleEnquiry = (at: Date) => {
    const deptCode = rng.pick([
      "GEN",
      "GEN",
      "PED",
      "ORT",
      "CAR",
      "OBG",
      "ENT",
      "DER",
      "SUR",
    ]);
    const tpl = pickCondition(deptCode, "outpatient");
    const internal = rng.chance(0.2);
    const existing = internal || rng.chance(0.35);
    const patient = existing ? patientFor(tpl, at, 0) : undefined;
    if (existing && !patient) return;
    const prospect = patient
      ? undefined
      : makePatientInput({
          ageRange: tpl.ageRange ?? (deptCode === "PED" ? [1, 12] : [18, 70]),
          gender: tpl.gender,
        });
    const receptionist = pickStaff(receptionists, at);
    const enq = enquiry.createEnquiry(tx(at, receptionist.id), {
      type: internal ? "INTERNAL" : "EXTERNAL",
      patientId: patient?.id,
      prospectName: prospect
        ? `${prospect.firstName} ${prospect.lastName}`
        : "",
      phone: patient?.phone ?? prospect!.phone,
      email: prospect?.email,
      source: internal
        ? "DEPARTMENT_REFERRAL"
        : rng.weighted([
            ["PHONE", 40],
            ["WALK_IN", 20],
            ["WEBSITE", 18],
            ["WHATSAPP", 14],
            ["REFERRAL", 5],
            ["HEALTH_CAMP", 3],
          ] as const),
      reason:
        rng.chance(0.3) && !internal
          ? rng.pick(ENQUIRY_REASONS)
          : tpl.complaint,
      departmentId: dept(deptCode),
      assignedToId: receptionist.id,
      referredById: internal ? rng.pick(doctors).id : undefined,
      notes: internal ? "Referred from another department for opinion." : "",
    });

    const outcome = rng.weighted([
      ["convert", 50],
      ["followup", 20],
      ["close", 12],
      ["cancel", 8],
      ["open", 10],
    ] as const);
    const convert = (t: Date) => {
      const current = find(db.enquiries, enq.id)!;
      if (current.status !== "NEW" && current.status !== "FOLLOW_UP_REQUIRED")
        return;
      const doctor = clinicalDoctor(deptCode);
      let slot: Date | undefined;
      for (let d = rng.int(0, 1); d <= 4 && !slot; d += 1)
        slot = freeSlot(doctor, addDays(startOfDay(t), d), addMinutes(t, 60));
      if (!slot) return;
      const apt = enquiry.convertToAppointment(
        tx(t, current.assignedToId),
        enq.id,
        {
          doctorId: doctor.id,
          scheduledAt: slot.toISOString(),
          type: internal ? "REFERRAL" : "NEW",
          newPatient: current.patientId ? undefined : prospect,
        }
      );
      scheduleVisit(apt.id, tpl);
    };

    if (outcome === "convert")
      schedule(
        addMinutes(at, rng.int(10, 26 * 60)),
        "enquiry convert",
        convert
      );
    if (outcome === "followup") {
      schedule(addMinutes(at, rng.int(60, 24 * 60)), "enquiry follow-up", t => {
        enquiry.addFollowUp(tx(t, receptionist.id), enq.id, {
          channel: rng.pick(["CALL", "WHATSAPP", "EMAIL"] as const),
          note: rng.pick([
            "Shared cost estimate; patient will confirm after discussing with family.",
            "Called back — asked to reconnect after salary date.",
            "Sent package brochure on WhatsApp.",
          ]),
          nextFollowUpDate: isoDate(addDays(t, rng.int(1, 4))),
        });
        const next = find(db.enquiries, enq.id)!.followUpDate!;
        const nextAt = atTime(new Date(next), rng.int(10, 17), rng.int(0, 59));
        schedule(nextAt, "enquiry second touch", t2 => {
          if (rng.chance(0.55)) convert(t2);
          else
            enquiry.closeEnquiry(
              tx(t2, receptionist.id),
              enq.id,
              "Patient opted for another facility closer to home."
            );
        });
      });
    }
    if (outcome === "close")
      schedule(addMinutes(at, rng.int(30, 360)), "enquiry close", t =>
        enquiry.closeEnquiry(
          tx(t, receptionist.id),
          enq.id,
          "Information shared; no appointment needed."
        )
      );
    if (outcome === "cancel")
      schedule(addMinutes(at, rng.int(120, 1800)), "enquiry cancel", t =>
        enquiry.cancelEnquiry(
          tx(t, receptionist.id),
          enq.id,
          "Enquirer not reachable after three attempts."
        )
      );
  };

  /* ------------------------------ complaints ------------------------- */

  const COMPLAINTS: Array<{
    category: ComplaintCategory;
    dept: string;
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }> = [
    {
      category: "WAITING_TIME",
      dept: "FRO",
      title: "Long wait despite appointment",
      description:
        "Had a 10:30 appointment but was seen after 12:00. No one informed us about the delay.",
      priority: "MEDIUM",
    },
    {
      category: "BILLING",
      dept: "BIL",
      title: "Charged twice for lab test",
      description:
        "The CBC charge appears on two receipts. Requesting correction.",
      priority: "HIGH",
    },
    {
      category: "CLEANLINESS",
      dept: "HKP",
      title: "Washroom not cleaned in ward",
      description: "Washroom in room 212 has not been cleaned since morning.",
      priority: "MEDIUM",
    },
    {
      category: "FOOD",
      dept: "OPS",
      title: "Diet served late and cold",
      description:
        "Lunch for the diabetic patient arrived at 3 PM and was cold.",
      priority: "LOW",
    },
    {
      category: "STAFF_BEHAVIOUR",
      dept: "FRO",
      title: "Rude behaviour at registration counter",
      description:
        "Staff at the counter spoke rudely when we asked about the queue.",
      priority: "HIGH",
    },
    {
      category: "CLINICAL_CARE",
      dept: "NUR",
      title: "Delay in response to call bell",
      description: "Call bell pressed at night; nurse came after 25 minutes.",
      priority: "HIGH",
    },
    {
      category: "FACILITIES",
      dept: "OPS",
      title: "AC not working in private room",
      description:
        "Air conditioning in room 403 has not worked since yesterday.",
      priority: "MEDIUM",
    },
    {
      category: "CLINICAL_CARE",
      dept: "LAB",
      title: "Lab report delayed",
      description: "Report promised in 4 hours was not ready by evening.",
      priority: "MEDIUM",
    },
    {
      category: "BILLING",
      dept: "BIL",
      title: "Discharge bill not explained",
      description:
        "Final bill is higher than the estimate given at admission. Need a breakdown.",
      priority: "HIGH",
    },
    {
      category: "OTHER",
      dept: "OPS",
      title: "Parking not available for patients",
      description: "Could not find parking and missed the appointment slot.",
      priority: "LOW",
    },
  ];

  const scheduleComplaint = (at: Date) => {
    const template = rng.pick(COMPLAINTS);
    const recent = db.encounters.filter(
      e => new Date(e.startedAt) > addDays(at, -3) && new Date(e.startedAt) < at
    );
    const encounter =
      rng.chance(0.75) && recent.length ? rng.pick(recent) : undefined;
    const patient = encounter
      ? find(db.patients, encounter.patientId)
      : undefined;
    const type = patient
      ? rng.chance(0.7)
        ? "PATIENT"
        : "ATTENDANT"
      : "VISITOR";
    const cmp = quality.logComplaint(tx(at, pickStaff(receptionists, at).id), {
      patientId: patient?.id,
      complainantName:
        type === "PATIENT"
          ? ""
          : `${rng.pick(FIRST_NAMES_MALE)} ${patient?.lastName ?? rng.pick(LAST_NAMES)}`,
      complainantType: type,
      contact: patient?.phone ?? phone(),
      encounterId: encounter?.id,
      category: template.category,
      departmentId: dept(template.dept),
      title: template.title,
      description: template.description,
      priority: template.priority,
    });
    const owner = () => {
      const pool = db.staff.filter(
        s =>
          s.departmentId === dept(template.dept) &&
          s.status === "ACTIVE" &&
          s.role !== "SUPPORT"
      );
      return pool.length ? rng.pick(pool) : rng.pick(opsManagers);
    };
    const assignAt = addMinutes(at, rng.int(30, 360));
    schedule(assignAt, "complaint assign", t =>
      quality.assignComplaint(tx(t, opsManagers[0]!.id), cmp.id, owner().id)
    );
    const startAt = addMinutes(assignAt, rng.int(30, 20 * 60));
    schedule(startAt, "complaint start", t => {
      quality.startComplaint(tx(t, opsManagers[0]!.id), cmp.id);
      quality.addComplaintNote(
        tx(addMinutes(t, 5), opsManagers[0]!.id),
        cmp.id,
        "Spoke to the complainant and the department in-charge; reviewing the timeline."
      );
    });
    if (rng.chance(0.82)) {
      const slaHours = quality.COMPLAINT_SLA_DAYS[template.priority] * 24;
      const resolveAt = addMinutes(
        startAt,
        rng.int(
          60,
          Math.max(90, slaHours * 60 * (rng.chance(0.85) ? 0.7 : 1.4))
        )
      );
      schedule(resolveAt, "complaint resolve", t => {
        quality.resolveComplaint(
          tx(t, opsManagers[0]!.id),
          cmp.id,
          rng.pick([
            "Apologised to the patient; counter staff counselled and queue display fixed.",
            "Duplicate charge reversed and revised receipt shared.",
            "Housekeeping schedule for the ward revised to 3-hourly rounds.",
            "Issue explained with itemised bill; patient satisfied.",
            "Maintenance completed and verified with the patient.",
          ])
        );
        if (rng.chance(0.75))
          schedule(
            addMinutes(t, rng.int(12 * 60, 36 * 60)),
            "complaint close",
            tc => quality.closeComplaint(tx(tc, opsManagers[0]!.id), cmp.id)
          );
      });
    }
  };

  /* ------------------------------- MRD ------------------------------- */

  const mrdBatch = (at: Date) => {
    const reviewer = pickStaff(mrdStaff, at);
    for (const record of db.medicalRecords) {
      if (
        record.status === "PENDING_REVIEW" &&
        record.submittedAt &&
        at.getTime() - new Date(record.submittedAt).getTime() > 16 * HOUR
      ) {
        if (rng.chance(0.93)) mrd.reviewRecord(tx(at, reviewer.id), record.id);
        else
          mrd.returnRecord(
            tx(at, reviewer.id),
            record.id,
            "Signature missing on the case sheet — please countersign."
          );
      } else if (
        record.status === "INCOMPLETE" &&
        record.reviewNote &&
        mrd.checklistComplete(db, record)
      ) {
        mrd.resubmitRecord(
          tx(at, find(db.staff, record.attendingDoctorId)!.id),
          record.id
        );
      }
    }
  };

  const archiveBatch = (at: Date) => {
    const officer = mrdStaff[0]!;
    for (const record of db.medicalRecords) {
      if (
        record.status === "COMPLETE" &&
        record.reviewedAt &&
        at.getTime() - new Date(record.reviewedAt).getTime() > 5 * DAY
      ) {
        mrd.archiveRecord(
          tx(at, officer.id),
          record.id,
          `Rack ${rng.pick(["A", "B", "C", "D", "E", "F"])} · Shelf ${rng.int(1, 6)}`
        );
      }
    }
  };

  /* ---------------------------- daily plans -------------------------- */

  for (let d = -HISTORY_DAYS; d <= 7; d += 1) {
    const day = addDays(today, d);
    const sunday = day.getDay() === 0;

    // Booked appointments (bookings happen on earlier days).
    for (const doctor of doctors) {
      if (doctorAvailability(db, doctor, isoDate(day)) !== "AVAILABLE")
        continue;
      const deptCode = DEPARTMENTS.find(
        x => deptByCode.get(x.code) === doctor.departmentId
      )!.code;
      const booked = sunday ? 1 : rng.int(1, 3);
      const slots = rng.sample(slotsFor(doctor, day), booked);
      for (const slot of slots) {
        const lead = rng.weighted([
          [0, 25],
          [1, 30],
          [2, 20],
          [3, 15],
          [5, 10],
        ] as const);
        let bookedAt = atTime(
          addDays(day, -lead),
          rng.int(8, 19),
          rng.int(0, 59)
        );
        if (bookedAt >= addMinutes(slot, -30))
          bookedAt = addMinutes(slot, -rng.int(40, 120));
        const tpl = pickCondition(
          deptCode,
          rng.chance(0.07) ? "inpatient" : "outpatient"
        );
        schedule(bookedAt, "booking", t => {
          const clash = db.appointments.some(
            a =>
              a.doctorId === doctor.id &&
              a.scheduledAt === slot.toISOString() &&
              a.status !== "CANCELLED" &&
              a.status !== "NO_SHOW"
          );
          if (clash) return;
          const patient = patientFor(tpl, t, 0.15);
          if (!patient) return;
          book(t, patient, doctor, slot, tpl);
        });
      }
      // Walk-ins.
      const walkIns = sunday ? rng.int(0, 2) : rng.int(0, 1);
      const window = slotsFor(doctor, day);
      for (let w = 0; w < walkIns && window.length; w += 1) {
        const at = addMinutes(rng.pick(window), rng.int(0, 14));
        const tpl = pickCondition(
          deptCode,
          rng.chance(0.08) ? "inpatient" : "outpatient"
        );
        schedule(at, "walk-in", t => {
          const patient = patientFor(tpl, t, 0.3);
          if (!patient) return;
          const apt = opd.bookAppointment(
            tx(t, pickStaff(receptionists, t).id),
            {
              patientId: patient.id,
              doctorId: doctor.id,
              scheduledAt: t.toISOString(),
              type: "NEW",
              source: "WALK_IN",
              reason: tpl.complaint,
              allowOverbook: true,
            }
          );
          scheduleVisit(apt.id, tpl);
        });
      }
    }

    if (d > 0) continue;

    // Direct / referral admissions.
    const direct = rng.int(5, 7);
    for (let k = 0; k < direct; k += 1) {
      const at = atTime(day, rng.int(8, 21), rng.int(0, 59));
      const deptCode = rng.weighted([
        ["GEN", 3],
        ["CAR", 2],
        ["SUR", 3],
        ["ORT", 2],
        ["OBG", 2],
        ["PED", 1],
      ] as const);
      const tpl = pickCondition(deptCode, "inpatient");
      schedule(at, "direct admission", t => {
        const patient = patientFor(tpl, t, 0.35);
        if (!patient) return;
        admit(
          t,
          patient,
          clinicalDoctor(deptCode),
          tpl,
          rng.chance(0.25) ? "REFERRAL" : "DIRECT"
        );
      });
    }

    for (let k = rng.int(3, 6); k > 0; k -= 1) {
      schedule(
        atTime(day, rng.int(9, 19), rng.int(0, 59)),
        "enquiry",
        scheduleEnquiry
      );
    }
    if (rng.chance(0.7))
      schedule(
        atTime(day, rng.int(10, 20), rng.int(0, 59)),
        "complaint",
        scheduleComplaint
      );
    if (rng.chance(0.25))
      schedule(
        atTime(day, rng.int(10, 20), rng.int(0, 59)),
        "complaint",
        scheduleComplaint
      );

    schedule(atTime(day, 11, 15), "mrd review", mrdBatch);
    schedule(atTime(day, 16, 30), "mrd archive", archiveBatch);

    // Over-the-counter sales at the pharmacy counter.
    for (let k = rng.int(2, 5); k > 0; k -= 1)
      schedule(
        atTime(day, rng.int(9, 20), rng.int(0, 59)),
        "counter sale",
        t => {
          const otc = db.medicines.filter(
            m =>
              !m.prescriptionOnly &&
              pharmacy.stockOnHand(db, m.id, isoDate(t)) > 20
          );
          const buyer = rng.pick(db.patients);
          if (!otc.length || !buyer) return;
          const picks = rng.sample(otc, rng.int(1, Math.min(3, otc.length)));
          pharmacy.counterSale(tx(t, pickStaff(pharmacists, t).id), {
            patientId: buyer.id,
            lines: picks.map(m => ({
              medicineId: m.id,
              quantity:
                m.form === "TABLET" || m.form === "CAPSULE"
                  ? rng.int(6, 20)
                  : 1,
            })),
            payment: rng.chance(0.93) ? { method: method() } : undefined,
          });
        }
      );
  }

  // Beds out of service and a reservation for the demo.
  schedule(atTime(addDays(today, -3), 10, 20), "maintenance", t => {
    const free = db.beds.filter(b => b.status === "AVAILABLE");
    const [first, second] = rng.sample(free, 2);
    if (first)
      ipd.setBedHousekeeping(
        tx(t, opsManagers[0]!.id),
        first.id,
        "MAINTENANCE",
        "Bed motor not working — biomedical team informed"
      );
    if (second)
      ipd.setBedHousekeeping(
        tx(t, opsManagers[0]!.id),
        second.id,
        "MAINTENANCE",
        "Oxygen outlet leaking — awaiting repair"
      );
    schedule(atTime(addDays(today, -1), 15, 0), "maintenance done", t2 => {
      if (second && find(db.beds, second.id)!.status === "MAINTENANCE")
        ipd.setBedHousekeeping(
          tx(t2, opsManagers[0]!.id),
          second.id,
          "AVAILABLE"
        );
    });
  });
  schedule(atTime(today, 8, 40), "reservation", t => {
    const bed = db.beds.find(
      b => b.status === "AVAILABLE" && b.code.startsWith("40")
    );
    if (bed)
      ipd.reserveBed(
        tx(t, opsManagers[0]!.id),
        bed.id,
        "Elective admission (knee replacement) tomorrow — Dr Subramanian"
      );
  });

  /* -------------------------------- run ------------------------------ */

  for (let event = queue.pop(); event; event = queue.pop()) {
    stats.events += 1;
    try {
      event.run(new Date(event.at));
    } catch (error) {
      fail(event.label, error);
    }
  }

  // Keep the audit feed to the recent window; older history lives in the
  // records themselves.
  const keepFrom = addDays(today, -2).toISOString();
  db.activity = db.activity.filter(e => e.at >= keepFrom);
  db.activity.sort((a, b) => a.at.localeCompare(b.at));

  db.meta.anchoredAt = nowIso;
  stats.ms = Date.now() - started;
  return { db, stats };
}
