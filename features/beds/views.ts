/**
 * View builders for beds: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import type { Database } from "@/lib/sim/schema";
import {
  getStaff,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type { Bed, BedStatus, ID, WardCategory } from "@/lib/sim/schema";
import { bedDays, hoursBetween } from "@/lib/sim/time";

export interface BedTile {
  id: ID;
  code: string;
  status: BedStatus;
  note?: string;
  statusChangedAt: string;
  hoursInStatus: number;
  room: string;
  ward: string;
  wardCode: string;
  floor: number;
  dailyRate: number;
  /** Occupant, or the admission a transfer is holding the bed for. */
  admission?: {
    id: ID;
    code: string;
    status: string;
    patient: PatientRef;
    doctor: string;
    days: number;
    admittedAt: string;
  };
  history: Array<{
    id: ID;
    admissionCode: string;
    admissionId: ID;
    patient: string;
    fromAt: string;
    toAt?: string;
  }>;
}
export interface WardBoard {
  id: ID;
  code: string;
  name: string;
  floor: number;
  category: WardCategory;
  dailyRate: number;
  rooms: Array<{ id: ID; number: string; beds: BedTile[] }>;
  counts: Record<BedStatus, number>;
  total: number;
}
const emptyCounts = (): Record<BedStatus, number> => ({
  AVAILABLE: 0,
  OCCUPIED: 0,
  RESERVED: 0,
  CLEANING: 0,
  MAINTENANCE: 0,
});
export function bedBoardView(db: Database, now: Date) {
  const tile = (
    bed: Bed,
    room: { number: string },
    ward: { name: string; code: string; floor: number; dailyRate: number }
  ): BedTile => {
    const admission = bed.admissionId
      ? db.admissions.find(a => a.id === bed.admissionId)
      : undefined;
    return {
      id: bed.id,
      code: bed.code,
      status: bed.status,
      note: bed.note,
      statusChangedAt: bed.statusChangedAt,
      hoursInStatus: hoursBetween(bed.statusChangedAt, now),
      room: room.number,
      ward: ward.name,
      wardCode: ward.code,
      floor: ward.floor,
      dailyRate: ward.dailyRate,
      admission: admission
        ? {
            id: admission.id,
            code: admission.code,
            status: admission.status,
            patient: patientRef(db, admission.patientId, now)!,
            doctor: staffName(getStaff(db, admission.doctorId)),
            days: bedDays(admission.admittedAt, now.toISOString()),
            admittedAt: admission.admittedAt,
          }
        : undefined,
      history: db.bedAssignments
        .filter(a => a.bedId === bed.id)
        .sort((a, b) => b.fromAt.localeCompare(a.fromAt))
        .slice(0, 6)
        .map(a => {
          const adm = db.admissions.find(x => x.id === a.admissionId)!;
          return {
            id: a.id,
            admissionCode: adm.code,
            admissionId: adm.id,
            patient: patientRef(db, adm.patientId, now)!.name,
            fromAt: a.fromAt,
            toAt: a.toAt,
          };
        }),
    };
  };

  const wards: WardBoard[] = db.wards
    .map(ward => {
      const rooms = db.rooms
        .filter(r => r.wardId === ward.id)
        .map(room => ({
          id: room.id,
          number: room.number,
          beds: db.beds
            .filter(b => b.roomId === room.id)
            .map(b => tile(b, room, ward)),
        }));
      const counts = emptyCounts();
      for (const room of rooms)
        for (const bed of room.beds) counts[bed.status] += 1;
      return {
        id: ward.id,
        code: ward.code,
        name: ward.name,
        floor: ward.floor,
        category: ward.category,
        dailyRate: ward.dailyRate,
        rooms,
        counts,
        total: rooms.reduce((s, r) => s + r.beds.length, 0),
      };
    })
    .sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name));

  const totals = emptyCounts();
  for (const w of wards)
    for (const [k, v] of Object.entries(w.counts)) totals[k as BedStatus] += v;
  return { wards, totals, total: db.beds.length };
}
