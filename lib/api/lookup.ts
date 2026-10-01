/**
 * Read helpers shared by every view builder. Names and locations are always
 * resolved from the single source row at read time — nothing is copied.
 */
import { currentAssignment } from "../domain/ipd";
import type {
  Admission,
  Bed,
  Database,
  ID,
  Patient,
  Staff,
} from "../sim/schema";
import { ageInYears } from "../sim/time";

export interface PatientRef {
  id: ID;
  uhid: string;
  name: string;
  age: number;
  gender: Patient["gender"];
  phone: string;
  allergies: string[];
}

export interface StaffRef {
  id: ID;
  name: string;
  role: Staff["role"];
  designation: string;
  department: string;
}

export interface BedRef {
  id: ID;
  code: string;
  ward: string;
  wardCode: string;
  room: string;
  floor: number;
  category: string;
}

export function staffName(staff: Staff | undefined) {
  if (!staff) return "—";
  return staff.role === "DOCTOR"
    ? `Dr ${staff.firstName} ${staff.lastName}`
    : `${staff.firstName} ${staff.lastName}`;
}

export function byId<T extends { id: ID }>(rows: T[]) {
  return new Map(rows.map(row => [row.id, row]));
}

/** Memoised per database snapshot: views call these in tight loops. */
const indexes = new WeakMap<Database, Map<string, Map<ID, unknown>>>();
function index<T extends { id: ID }>(
  db: Database,
  table: keyof Database
): Map<ID, T> {
  let perDb = indexes.get(db);
  if (!perDb) {
    perDb = new Map();
    indexes.set(db, perDb);
  }
  const rows = db[table] as unknown as T[];
  const cached = perDb.get(table) as
    (Map<ID, T> & { size: number }) | undefined;
  if (cached && cached.size === rows.length) return cached;
  const map = byId(rows);
  perDb.set(table, map as Map<ID, unknown>);
  return map;
}

export function getPatient(db: Database, id: ID | undefined) {
  return id ? index<Patient>(db, "patients").get(id) : undefined;
}

export function getStaff(db: Database, id: ID | undefined) {
  return id ? index<Staff>(db, "staff").get(id) : undefined;
}

export function departmentName(db: Database, id: ID | undefined) {
  return id ? (db.departments.find(d => d.id === id)?.name ?? "—") : "—";
}

export function patientRef(
  db: Database,
  id: ID | undefined,
  now = new Date()
): PatientRef | undefined {
  const p = getPatient(db, id);
  if (!p) return undefined;
  return {
    id: p.id,
    uhid: p.uhid,
    name: `${p.firstName} ${p.lastName}`,
    age: ageInYears(p.dateOfBirth, now),
    gender: p.gender,
    phone: p.phone,
    allergies: p.allergies,
  };
}

export function bedRef(db: Database, bed: Bed | undefined): BedRef | undefined {
  if (!bed) return undefined;
  const room = db.rooms.find(r => r.id === bed.roomId);
  const ward = db.wards.find(w => w.id === room?.wardId);
  return {
    id: bed.id,
    code: bed.code,
    ward: ward?.name ?? "—",
    wardCode: ward?.code ?? "—",
    room: room?.number ?? "—",
    floor: ward?.floor ?? 0,
    category: ward?.category ?? "GENERAL",
  };
}

export function admissionBed(
  db: Database,
  admission: Admission
): BedRef | undefined {
  const assignment = currentAssignment(db, admission.id);
  const bedId =
    assignment?.bedId ??
    [...db.bedAssignments].reverse().find(a => a.admissionId === admission.id)
      ?.bedId;
  return bedRef(
    db,
    db.beds.find(b => b.id === bedId)
  );
}

export function matches(query: string, ...values: Array<string | undefined>) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return values.some(v => {
    if (!v) return false;
    const lower = v.toLowerCase();
    if (lower.includes(q)) return true;
    return digits.length >= 4 && lower.replace(/\D/g, "").includes(digits);
  });
}
