/**
 * View builders for opd: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import { invoiceTotals } from "@/lib/domain/billing";
import { labOrderTests } from "@/lib/domain/lab";
import { stockOnHand } from "@/lib/domain/pharmacy";
import { doctorAvailability, isOnDuty } from "@/lib/domain/wfm";
import {
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type {
  Appointment,
  Database,
  Encounter,
  ID,
  LabOrder,
  Patient,
  ResultFlag,
} from "@/lib/sim/schema";
import { fileOf } from "@/lib/domain/files";
import { isoDate, minutesBetween } from "@/lib/sim/time";

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

export interface QueueRow {
  id: ID;
  code: string;
  status: Appointment["status"];
  type: Appointment["type"];
  source: Appointment["source"];
  scheduledAt: string;
  tokenNumber?: number;
  checkedInAt?: string;
  consultationStartedAt?: string;
  completedAt?: string;
  waitMinutes?: number;
  reason: string;
  patient: PatientRef;
  doctor: { id: ID; name: string };
  department: string;
  encounterId?: ID;
  vitalsRecorded: boolean;
  pendingLabs: number;
  pendingRx: number;
}
function queueRow(db: Database, a: Appointment, now: Date): QueueRow {
  const encounter = a.encounterId
    ? db.encounters.find(e => e.id === a.encounterId)
    : undefined;
  const waitEnd =
    a.consultationStartedAt ??
    (a.status === "CHECKED_IN" ? now.toISOString() : undefined);
  return {
    id: a.id,
    code: a.code,
    status: a.status,
    type: a.type,
    source: a.source,
    scheduledAt: a.scheduledAt,
    tokenNumber: a.tokenNumber,
    checkedInAt: a.checkedInAt,
    consultationStartedAt: a.consultationStartedAt,
    completedAt: a.completedAt,
    waitMinutes:
      a.checkedInAt && waitEnd
        ? minutesBetween(a.checkedInAt, waitEnd)
        : undefined,
    reason: a.reason,
    patient: patientRef(db, a.patientId, now)!,
    doctor: { id: a.doctorId, name: staffName(getStaff(db, a.doctorId)) },
    department: departmentName(db, a.departmentId),
    encounterId: a.encounterId,
    vitalsRecorded: Boolean(encounter?.vitals),
    pendingLabs: encounter
      ? db.labOrders.filter(
          o =>
            o.encounterId === encounter.id &&
            o.status !== "VERIFIED" &&
            o.status !== "CANCELLED"
        ).length
      : 0,
    pendingRx: encounter
      ? db.prescriptions.filter(
          p =>
            p.encounterId === encounter.id &&
            (p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED")
        ).length
      : 0,
  };
}
export interface OpdDashboard {
  rows: QueueRow[];
  counts: Record<Appointment["status"], number>;
  averageWait: number | null;
  longestWaiting: number | null;
  doctors: Array<{
    id: ID;
    name: string;
    department: string;
    onDuty: boolean;
    waiting: number;
    inConsultation: boolean;
    seen: number;
    booked: number;
  }>;
}
export function opdDashboardView(
  db: Database,
  now: Date,
  filters: { doctorId?: ID; departmentId?: ID }
): OpdDashboard {
  const today = isoDate(now);
  const all = db.appointments.filter(a => isoDate(a.scheduledAt) === today);
  const scoped = all.filter(
    a =>
      (!filters.doctorId || a.doctorId === filters.doctorId) &&
      (!filters.departmentId || a.departmentId === filters.departmentId)
  );
  const rows = scoped
    .map(a => queueRow(db, a, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const counts = {
    SCHEDULED: 0,
    CHECKED_IN: 0,
    IN_CONSULTATION: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    NO_SHOW: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  const waits = rows
    .filter(r => r.consultationStartedAt && r.waitMinutes !== undefined)
    .map(r => r.waitMinutes!);
  const waitingNow = rows
    .filter(r => r.status === "CHECKED_IN")
    .map(r => r.waitMinutes ?? 0);

  const doctorIds = [...new Set(all.map(a => a.doctorId))];
  const doctors = doctorIds
    .map(id => {
      const doctor = getStaff(db, id)!;
      const mine = all.filter(a => a.doctorId === id);
      return {
        id,
        name: staffName(doctor),
        department: departmentName(db, doctor.departmentId),
        onDuty: isOnDuty(db, doctor, now),
        waiting: mine.filter(a => a.status === "CHECKED_IN").length,
        inConsultation: mine.some(a => a.status === "IN_CONSULTATION"),
        seen: mine.filter(a => a.status === "COMPLETED").length,
        booked: mine.filter(a => a.status !== "CANCELLED").length,
      };
    })
    .sort((a, b) => b.waiting - a.waiting || b.booked - a.booked);

  return {
    rows,
    counts,
    averageWait: waits.length
      ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length)
      : null,
    longestWaiting: waitingNow.length ? Math.max(...waitingNow) : null,
    doctors,
  };
}

/* ------------------------------------------------------------------ */
/* Appointment book                                                    */
/* ------------------------------------------------------------------ */
export function appointmentsView(
  db: Database,
  now: Date,
  filters: {
    from: string;
    to: string;
    doctorId?: ID;
    status?: string;
    q?: string;
  }
) {
  return db.appointments
    .filter(a => {
      const day = isoDate(a.scheduledAt);
      if (day < filters.from || day > filters.to) return false;
      if (filters.doctorId && a.doctorId !== filters.doctorId) return false;
      if (filters.status && a.status !== filters.status) return false;
      if (filters.q) {
        const p = db.patients.find(x => x.id === a.patientId);
        return matches(
          filters.q,
          a.code,
          p && `${p.firstName} ${p.lastName}`,
          p?.uhid,
          p?.phone
        );
      }
      return true;
    })
    .map(a => queueRow(db, a, now));
}

/* ------------------------------------------------------------------ */
/* Booking options                                                     */
/* ------------------------------------------------------------------ */

export interface DoctorOption {
  id: ID;
  name: string;
  department: string;
  departmentId: ID;
  specialisation?: string;
  fee: number;
  availability: ReturnType<typeof doctorAvailability>;
  bookedTimes: string[];
}
export function doctorOptionsView(
  db: Database,
  _now: Date,
  { date }: { date: string }
) {
  return db.staff
    .filter(s => s.role === "DOCTOR" && s.status !== "INACTIVE")
    .map<DoctorOption>(doctor => ({
      id: doctor.id,
      name: staffName(doctor),
      department: departmentName(db, doctor.departmentId),
      departmentId: doctor.departmentId,
      specialisation: doctor.specialisation,
      fee: doctor.consultationFee ?? 500,
      availability: doctorAvailability(db, doctor, date),
      bookedTimes: db.appointments
        .filter(
          a =>
            a.doctorId === doctor.id &&
            isoDate(a.scheduledAt) === date &&
            a.status !== "CANCELLED" &&
            a.status !== "NO_SHOW"
        )
        .map(a => a.scheduledAt),
    }))
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department) || a.name.localeCompare(b.name)
    );
}

/** Rostered OPD slots for a doctor on a date (15-minute grid within the shift). */
export function doctorSlotsView(
  db: Database,
  now: Date,
  { doctorId, date }: { doctorId?: ID; date: string }
) {
  if (!doctorId) return [];
  const row = db.roster.find(r => r.staffId === doctorId && r.date === date);
  const shift = row?.shiftId
    ? db.shifts.find(s => s.id === row.shiftId)
    : undefined;
  const ranges: Array<[number, number]> =
    !row || row.status !== "SCHEDULED" || !shift
      ? row
        ? []
        : [[9 * 60 + 30, 16 * 60 + 45]]
      : shift.code === "M"
        ? [[9 * 60, 13 * 60 + 45]]
        : shift.code === "E"
          ? [[15 * 60, 19 * 60 + 45]]
          : shift.code === "N"
            ? [[20 * 60, 22 * 60]]
            : [
                [9 * 60 + 30, 12 * 60 + 45],
                [14 * 60, 16 * 60 + 45],
              ];
  const taken = new Set(
    db.appointments
      .filter(
        a =>
          a.doctorId === doctorId &&
          isoDate(a.scheduledAt) === date &&
          a.status !== "CANCELLED" &&
          a.status !== "NO_SHOW"
      )
      .map(a => new Date(a.scheduledAt).getTime())
  );
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const slots: Array<{ iso: string; taken: boolean; past: boolean }> = [];
  for (const [from, to] of ranges) {
    for (let minute = from; minute <= to; minute += 15) {
      const t = new Date(base.getTime() + minute * 60_000);
      slots.push({
        iso: t.toISOString(),
        taken: taken.has(t.getTime()),
        past: t.getTime() < now.getTime() - 10 * 60_000,
      });
    }
  }
  return slots;
}

export interface PatientOption {
  id: ID;
  uhid: string;
  name: string;
  phone: string;
  age: number;
  gender: Patient["gender"];
}
export function patientSearchView(
  db: Database,
  now: Date,
  { query }: { query: string }
) {
  return db.patients
    .filter(p =>
      matches(query, `${p.firstName} ${p.lastName}`, p.uhid, p.phone)
    )
    .slice(0, 25)
    .map<PatientOption>(p => {
      const ref = patientRef(db, p.id, now)!;
      return {
        id: p.id,
        uhid: p.uhid,
        name: ref.name,
        phone: p.phone,
        age: ref.age,
        gender: p.gender,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Consultation (visit) record                                         */
/* ------------------------------------------------------------------ */

export interface LabOrderView {
  id: ID;
  code: string;
  status: LabOrder["status"];
  priority: LabOrder["priority"];
  orderedAt: string;
  orderedBy: string;
  sampleId?: string;
  verifiedAt?: string;
  tests: Array<{
    itemId: ID;
    code: string;
    name: string;
    results: Array<{
      parameter: string;
      value: string;
      unit: string;
      flag: ResultFlag;
      reference: string;
    }>;
  }>;
}
export function labOrderView(db: Database, order: LabOrder): LabOrderView {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    priority: order.priority,
    orderedAt: order.orderedAt,
    orderedBy: staffName(getStaff(db, order.orderedById)),
    sampleId: order.sampleId,
    verifiedAt: order.verifiedAt,
    tests: labOrderTests(db, order.id).map(({ item, test }) => ({
      itemId: item.id,
      code: test.code,
      name: test.name,
      results: db.labResults
        .filter(r => r.labOrderItemId === item.id)
        .map(r => {
          const p = test.parameters.find(x => x.id === r.parameterId)!;
          return {
            parameter: p.name,
            value: r.value,
            unit: p.unit,
            flag: r.flag,
            reference:
              p.refText ??
              (p.refLow !== undefined && p.refHigh !== undefined
                ? `${p.refLow}–${p.refHigh}`
                : "—"),
          };
        }),
    })),
  };
}
export interface PrescriptionView {
  id: ID;
  code: string;
  status: string;
  createdAt: string;
  prescriber: string;
  isDischargeMedication?: boolean;
  items: Array<{
    id: ID;
    medicine: string;
    strength: string;
    form: string;
    dose: string;
    frequency: string;
    route: string;
    durationDays: number;
    quantityPrescribed: number;
    quantityDispensed: number;
    quantityReturned: number;
    instructions: string;
    status: string;
    unit: string;
  }>;
}
export function prescriptionView(db: Database, id: ID): PrescriptionView {
  const rx = db.prescriptions.find(p => p.id === id)!;
  return {
    id: rx.id,
    code: rx.code,
    status: rx.status,
    createdAt: rx.createdAt,
    prescriber: staffName(getStaff(db, rx.prescriberId)),
    isDischargeMedication: rx.isDischargeMedication,
    items: db.prescriptionItems
      .filter(i => i.prescriptionId === rx.id)
      .map(i => {
        const m = db.medicines.find(x => x.id === i.medicineId)!;
        return {
          id: i.id,
          medicine: m.name,
          strength: m.strength,
          form: m.form,
          unit: m.unit,
          dose: i.dose,
          frequency: i.frequency,
          route: i.route,
          durationDays: i.durationDays,
          quantityPrescribed: i.quantityPrescribed,
          quantityDispensed: i.quantityDispensed,
          quantityReturned: i.quantityReturned,
          instructions: i.instructions,
          status: i.status,
        };
      }),
  };
}
export interface VisitDetail {
  encounter: Encounter;
  appointment?: Appointment;
  patient: Patient & { age: number; photoFileId?: ID };
  doctor: {
    id: ID;
    name: string;
    department: string;
    designation: string;
    qualification?: string;
    specialisation?: string;
  };
  department: string;
  prescriptions: PrescriptionView[];
  labOrders: LabOrderView[];
  bills: Array<{
    id: ID;
    code: string;
    status: string;
    total: number;
    balance: number;
  }>;
  history: Array<{
    id: ID;
    code: string;
    date: string;
    type: string;
    doctor: string;
    diagnoses: string[];
  }>;
  activeAdmissionId?: ID;
  medicalRecordId?: ID;
  enquiryCode?: string;
}
export function visitView(
  db: Database,
  now: Date,
  { encounterId }: { encounterId: ID }
): VisitDetail | null {
  const encounter = db.encounters.find(e => e.id === encounterId);
  if (!encounter) return null;
  const patient = db.patients.find(p => p.id === encounter.patientId)!;
  const doctor = getStaff(db, encounter.doctorId)!;
  const appointment = db.appointments.find(
    a => a.id === encounter.appointmentId
  );
  return {
    encounter,
    appointment,
    patient: {
      ...patient,
      age: patientRef(db, patient.id, now)!.age,
      photoFileId: fileOf(db, "PATIENT_PHOTO", patient.id)?.id,
    },
    doctor: {
      id: doctor.id,
      name: staffName(doctor),
      department: departmentName(db, doctor.departmentId),
      designation: doctor.designation,
      qualification: doctor.qualification,
      specialisation: doctor.specialisation,
    },
    department: departmentName(db, encounter.departmentId),
    prescriptions: db.prescriptions
      .filter(p => p.encounterId === encounter.id)
      .map(p => prescriptionView(db, p.id)),
    labOrders: db.labOrders
      .filter(o => o.encounterId === encounter.id)
      .map(o => labOrderView(db, o)),
    bills: db.invoices
      .filter(i => i.encounterId === encounter.id)
      .map(i => {
        const t = invoiceTotals(db, i.id);
        return {
          id: i.id,
          code: i.code,
          status: i.status,
          total: t.total,
          balance: t.balance,
        };
      }),
    history: db.encounters
      .filter(
        e =>
          e.patientId === patient.id &&
          e.id !== encounter.id &&
          e.status === "CLOSED"
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 6)
      .map(e => ({
        id: e.id,
        code: e.code,
        date: e.startedAt,
        type: e.type,
        doctor: staffName(getStaff(db, e.doctorId)),
        diagnoses: e.diagnoses.map(d => d.description),
      })),
    activeAdmissionId: db.admissions.find(
      a => a.patientId === patient.id && a.status !== "DISCHARGED"
    )?.id,
    medicalRecordId: db.medicalRecords.find(r => r.encounterId === encounter.id)
      ?.id,
    enquiryCode: appointment?.enquiryId
      ? db.enquiries.find(e => e.id === appointment.enquiryId)?.code
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Order catalogues                                                    */
/* ------------------------------------------------------------------ */
export function medicineOptionsView(db: Database, now: Date) {
  const today = isoDate(now);
  return db.medicines.map(m => ({
    id: m.id,
    name: m.name,
    genericName: m.genericName,
    strength: m.strength,
    form: m.form,
    unit: m.unit,
    category: m.category,
    unitPrice: m.unitPrice,
    prescriptionOnly: m.prescriptionOnly,
    stock: stockOnHand(db, m.id, today),
  }));
}

export function labTestOptionsView(db: Database) {
  return db.labTests.map(t => ({
    id: t.id,
    code: t.code,
    name: t.name,
    section: t.section,
    price: t.price,
    tat: t.turnaroundHours,
    sampleType: t.sampleType,
  }));
}

export function departmentsView(db: Database) {
  return db.departments.map(d => ({
    id: d.id,
    code: d.code,
    name: d.name,
    kind: d.kind,
    location: d.location,
  }));
}

export function staffOptionsView(
  db: Database,
  _now: Date,
  { roles }: { roles?: string[] }
) {
  return db.staff
    .filter(s => s.status === "ACTIVE" && (!roles || roles.includes(s.role)))
    .map(s => ({
      id: s.id,
      name: staffName(s),
      role: s.role,
      designation: s.designation,
      departmentId: s.departmentId,
      department: departmentName(db, s.departmentId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface TokenBoardRow {
  doctorId: ID;
  doctor: string;
  department: string;
  room: string;
  /** Token in consultation now, if any. */
  serving?: number;
  /** Checked-in tokens waiting, in call order. */
  next: number[];
  waiting: number;
}

/**
 * The waiting-area token display: per doctor with patients today, the token
 * being seen and the tokens next in line. Token numbers only — no names on
 * a public screen.
 */
export function tokenBoardView(db: Database, now: Date): TokenBoardRow[] {
  const today = isoDate(now);
  const byDoctor = new Map<ID, typeof db.appointments>();
  for (const a of db.appointments) {
    if (!a.tokenNumber || isoDate(a.scheduledAt) !== today) continue;
    if (a.status !== "CHECKED_IN" && a.status !== "IN_CONSULTATION") continue;
    byDoctor.set(a.doctorId, [...(byDoctor.get(a.doctorId) ?? []), a]);
  }
  return [...byDoctor.entries()]
    .map(([doctorId, list]) => {
      const doctor = db.staff.find(s => s.id === doctorId);
      const department = db.departments.find(
        d => d.id === doctor?.departmentId
      );
      const waiting = list
        .filter(a => a.status === "CHECKED_IN")
        .sort((a, b) => a.tokenNumber! - b.tokenNumber!);
      return {
        doctorId,
        doctor: staffName(doctor),
        department: department?.name ?? "—",
        room: department?.location ?? "",
        serving: list.find(a => a.status === "IN_CONSULTATION")?.tokenNumber,
        next: waiting.slice(0, 5).map(a => a.tokenNumber!),
        waiting: waiting.length,
      };
    })
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department) ||
        a.doctor.localeCompare(b.doctor)
    );
}
