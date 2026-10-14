/**
 * View builders for wfm: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import type { Database } from "@/lib/sim/schema";
import { fileOf } from "@/lib/domain/files";
import { isOnDuty } from "@/lib/domain/wfm";
import { departmentName, matches, staffName } from "@/lib/api/lookup";
import type {
  AttendanceStatus,
  ID,
  RosterStatus,
  Staff,
} from "@/lib/sim/schema";
import { addDaysIso, isoDate, minutesBetween } from "@/lib/sim/time";

export interface StaffRow {
  id: ID;
  staffCode: string;
  name: string;
  role: Staff["role"];
  designation: string;
  department: string;
  departmentId: ID;
  phone: string;
  email: string;
  status: Staff["status"];
  specialisation?: string;
  today: {
    status: RosterStatus | "UNROSTERED";
    shift?: string;
    window?: string;
  };
  onDuty: boolean;
}
export function staffListView(
  db: Database,
  now: Date,
  filters: {
    q?: string;
    departmentId?: string;
    role?: string;
    status?: string;
  }
) {
  const today = isoDate(now);
  const shifts = new Map(db.shifts.map(s => [s.id, s]));
  const rosterToday = new Map(
    db.roster.filter(r => r.date === today).map(r => [r.staffId, r])
  );
  return db.staff
    .filter(
      s =>
        (!filters.departmentId || s.departmentId === filters.departmentId) &&
        (!filters.role || s.role === filters.role) &&
        (!filters.status || s.status === filters.status) &&
        (!filters.q ||
          matches(
            filters.q,
            `${s.firstName} ${s.lastName}`,
            s.staffCode,
            s.designation,
            s.phone
          ))
    )
    .map<StaffRow>(s => {
      const r = rosterToday.get(s.id);
      const shift = r?.shiftId ? shifts.get(r.shiftId) : undefined;
      return {
        id: s.id,
        staffCode: s.staffCode,
        name: staffName(s),
        role: s.role,
        designation: s.designation,
        department: departmentName(db, s.departmentId),
        departmentId: s.departmentId,
        phone: s.phone,
        email: s.email,
        status: s.status,
        specialisation: s.specialisation,
        today: {
          status: r?.status ?? "UNROSTERED",
          shift: shift?.name,
          window: shift ? `${shift.start}–${shift.end}` : undefined,
        },
        onDuty: isOnDuty(db, s, now),
      };
    });
}

export function staffProfileView(
  db: Database,
  now: Date,
  { id }: { id: ID | null }
) {
  const s = db.staff.find(x => x.id === id);
  if (!s) return null;
  const today = isoDate(now);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(today, i));
  const shifts = new Map(db.shifts.map(x => [x.id, x]));
  const attendance = db.attendance
    .filter(a => a.staffId === s.id && a.date >= addDaysIso(today, -29))
    .sort((a, b) => b.date.localeCompare(a.date));
  const presentDays = attendance.filter(a =>
    (["PRESENT", "LATE", "HALF_DAY"] as AttendanceStatus[]).includes(a.status)
  ).length;
  const activity =
    s.role === "DOCTOR"
      ? [
          {
            label: "OPD visits · 30 d",
            value: db.encounters.filter(
              e =>
                e.doctorId === s.id &&
                e.type === "OPD" &&
                e.startedAt >= monthAgo
            ).length,
          },
          {
            label: "Current inpatients",
            value: db.admissions.filter(
              a => a.doctorId === s.id && a.status !== "DISCHARGED"
            ).length,
          },
          { label: "Consultation fee", value: s.consultationFee ?? 0 },
        ]
      : s.role === "PHARMACIST"
        ? [
            {
              label: "Dispensing draws · 30 d",
              value: db.pharmacyTransactions.filter(
                t =>
                  t.byId === s.id && t.type === "DISPENSE" && t.at >= monthAgo
              ).length,
            },
          ]
        : s.role === "LAB_TECHNICIAN"
          ? [
              {
                label: "Samples processed · 30 d",
                value: db.labOrders.filter(
                  o => o.technicianId === s.id && o.orderedAt >= monthAgo
                ).length,
              },
            ]
          : [];
  return {
    staff: s,
    name: staffName(s),
    photoFileId: fileOf(db, "STAFF_PHOTO", s.id)?.id,
    department: departmentName(db, s.departmentId),
    onDuty: isOnDuty(db, s, now),
    week: days.map(date => {
      const r = db.roster.find(x => x.staffId === s.id && x.date === date);
      const shift = r?.shiftId ? shifts.get(r.shiftId) : undefined;
      return {
        date,
        status: r?.status ?? "UNROSTERED",
        shift: shift?.code,
        window: shift ? `${shift.start}–${shift.end}` : undefined,
      };
    }),
    activity,
    todayAttendance: db.attendance.find(
      a => a.staffId === s.id && a.date === today
    ),
    attendance30: {
      marked: attendance.length,
      present: presentDays,
      absent: attendance.filter(a => a.status === "ABSENT").length,
      late: attendance.filter(a => a.status === "LATE").length,
      rate: attendance.length
        ? Math.round((presentDays / attendance.length) * 100)
        : null,
    },
    tenureYears: Math.max(
      0,
      Math.floor(minutesBetween(s.joinedOn, now) / (60 * 24 * 365))
    ),
  };
}

export type AttendanceDisplayStatus = AttendanceStatus | "NOT_MARKED";

export interface AttendanceRow {
  id: ID;
  staffId: ID;
  staffCode: string;
  name: string;
  role: Staff["role"];
  designation: string;
  department: string;
  departmentId: ID;
  staffStatus: Staff["status"];
  status: AttendanceDisplayStatus;
  checkInAt?: string;
  checkOutAt?: string;
  note?: string;
  recordedBy?: string;
  rosterStatus: RosterStatus | "UNROSTERED";
  shift?: string;
  shiftWindow?: string;
}

export function attendanceView(
  db: Database,
  now: Date,
  filters: {
    date: string;
    q?: string;
    departmentId?: string;
    status?: string;
    staffId?: string;
  }
) {
  const date = filters.date || isoDate(now);
  const shifts = new Map(db.shifts.map(s => [s.id, s]));
  const roster = new Map(
    db.roster.filter(r => r.date === date).map(r => [r.staffId, r])
  );
  const attendance = new Map(
    db.attendance.filter(a => a.date === date).map(a => [a.staffId, a])
  );
  const staffById = new Map(db.staff.map(s => [s.id, s]));
  const base = db.staff.filter(
    s =>
      s.status !== "INACTIVE" &&
      (!filters.staffId || s.id === filters.staffId) &&
      (!filters.departmentId || s.departmentId === filters.departmentId)
  );
  const allRows = base
    .map<AttendanceRow>(s => {
      const record = attendance.get(s.id);
      const duty = roster.get(s.id);
      const shift = duty?.shiftId ? shifts.get(duty.shiftId) : undefined;
      const recordedBy = record
        ? staffById.get(record.recordedById)
        : undefined;
      return {
        id: record?.id ?? `unmarked-${s.id}-${date}`,
        staffId: s.id,
        staffCode: s.staffCode,
        name: staffName(s),
        role: s.role,
        designation: s.designation,
        department: departmentName(db, s.departmentId),
        departmentId: s.departmentId,
        staffStatus: s.status,
        status: record?.status ?? "NOT_MARKED",
        checkInAt: record?.checkInAt,
        checkOutAt: record?.checkOutAt,
        note: record?.note,
        recordedBy: recordedBy ? staffName(recordedBy) : undefined,
        rosterStatus: duty?.status ?? "UNROSTERED",
        shift: shift?.name,
        shiftWindow: shift ? `${shift.start}–${shift.end}` : undefined,
      };
    })
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department) || a.name.localeCompare(b.name)
    );
  const rows = allRows.filter(
    row =>
      (!filters.status || row.status === filters.status) &&
      (!filters.q ||
        matches(
          filters.q,
          row.name,
          row.staffCode,
          row.designation,
          row.department
        ))
  );
  const count = (status: AttendanceDisplayStatus) =>
    allRows.filter(r => r.status === status).length;
  return {
    date,
    rows,
    summary: {
      total: allRows.length,
      present: count("PRESENT"),
      late: count("LATE"),
      halfDay: count("HALF_DAY"),
      absent: count("ABSENT"),
      leave: count("LEAVE"),
      offDuty: count("OFF_DUTY"),
      notMarked: count("NOT_MARKED"),
    },
  };
}

export interface RosterCell {
  date: string;
  status: RosterStatus | "UNROSTERED";
  shiftId?: ID;
  shiftCode?: string;
  note?: string;
}
export function rosterView(
  db: Database,
  _now: Date,
  filters: {
    weekStart: string;
    departmentId?: string;
    role?: string;
  }
) {
  const days = Array.from({ length: 7 }, (_, i) =>
    addDaysIso(filters.weekStart, i)
  );
  const shifts = new Map(db.shifts.map(s => [s.id, s]));
  const index = new Map(
    db.roster
      .filter(r => days.includes(r.date))
      .map(r => [`${r.staffId}|${r.date}`, r])
  );
  const staff = db.staff
    .filter(
      s =>
        s.status !== "INACTIVE" &&
        (!filters.departmentId || s.departmentId === filters.departmentId) &&
        (!filters.role || s.role === filters.role)
    )
    .sort(
      (a, b) =>
        departmentName(db, a.departmentId).localeCompare(
          departmentName(db, b.departmentId)
        ) ||
        a.role.localeCompare(b.role) ||
        a.firstName.localeCompare(b.firstName)
    );
  const rows = staff.map(s => ({
    id: s.id,
    name: staffName(s),
    role: s.role,
    designation: s.designation,
    department: departmentName(db, s.departmentId),
    status: s.status,
    cells: days.map<RosterCell>(date => {
      const r = index.get(`${s.id}|${date}`);
      return {
        date,
        status: r?.status ?? "UNROSTERED",
        shiftId: r?.shiftId,
        shiftCode: r?.shiftId ? shifts.get(r.shiftId)?.code : undefined,
        note: r?.note,
      };
    }),
  }));
  const coverage = days.map((date, i) => {
    const counts = { M: 0, E: 0, N: 0, G: 0 };
    for (const row of rows) {
      const cell = row.cells[i]!;
      const code = cell.shiftCode as keyof typeof counts | undefined;
      if (cell.status === "SCHEDULED" && code && code in counts)
        counts[code] += 1;
    }
    return {
      date,
      ...counts,
      leave: rows.filter(r => r.cells[i]!.status === "LEAVE").length,
    };
  });
  return { days, rows, coverage, shifts: db.shifts };
}
