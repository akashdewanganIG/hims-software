/**
 * Test harness: a freshly seeded hospital per test, a controllable clock,
 * and a `run` that goes through the exact path the app uses (validate →
 * authorise → atomic domain operation). Every operation's change set is also
 * replayed onto a shadow copy, which must end up identical to the database —
 * proving the server persists exactly what each operation changed.
 */
process.env.TZ = "Asia/Kolkata";

import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

import {
  prepareOperation,
  toOperationError,
  type OperationError,
  type OperationErrorCode,
} from "../lib/ops/execute";
import type {
  OperationInput,
  OperationName,
  OperationResult,
} from "../lib/ops/registry";
import { applyPayload, toPayload } from "../lib/sim/changes";
import { checkIntegrity } from "../lib/sim/integrity";
import { transactTracked } from "../lib/sim/journal";
import { STAFF } from "../lib/sim/reference";
import { onePagePdf } from "../lib/sim/scans";
import type { Database, ID, SystemRole, TableName } from "../lib/sim/schema";
import { generateDatabase } from "../lib/sim/seed";
import { isoDate } from "../lib/sim/time";

/** Wednesday 30 September 2026, 10:30 in the hospital (IST). */
export const T0 = new Date(2026, 8, 30, 10, 30);

let seeded: Database | null = null;
export function seededDatabase(): Database {
  seeded ??= generateDatabase(T0).db;
  return structuredClone(seeded);
}

export const json = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/** Cheap, order-sensitive fingerprint of the whole database. */
export function fingerprint(db: Database) {
  const text = JSON.stringify(db);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

/** Operation names that completed successfully somewhere in this process. */
export const exercised = new Set<string>();

export class Hospital {
  db: Database;
  shadow: Database;
  now: Date;

  constructor(at: Date = T0) {
    this.db = seededDatabase();
    this.shadow = structuredClone(this.db);
    this.now = new Date(at);
  }

  get today() {
    return isoDate(this.now);
  }

  advance(minutes: number) {
    this.now = new Date(this.now.getTime() + minutes * 60_000);
    return this;
  }

  /** A time today (or `days` ahead) in the hospital's local time. */
  at(hours: number, minutes = 0, days = 0) {
    const d = new Date(this.now);
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  /**
   * An active login on one of the seeded roles, without custom access (the
   * sign-in screen's suggested one first).
   */
  login(role: SystemRole): ID {
    const candidates = this.db.users
      .filter(
        u => u.roleId === role && u.status === "ACTIVE" && !u.customAccess
      )
      .map(u => ({ u, s: this.db.staff.find(s => s.id === u.staffId)! }))
      .filter(({ s }) => s.status === "ACTIVE")
      .sort((a, b) => {
        const primary = (x: typeof a) =>
          STAFF.find(p => p.first === x.s.firstName && p.last === x.s.lastName)
            ?.primaryLogin
            ? 1
            : 0;
        return primary(b) - primary(a);
      });
    assert.ok(candidates[0], `no active ${role} login`);
    return candidates[0].u.id;
  }

  staffOf(userId: ID) {
    const user = this.db.users.find(u => u.id === userId)!;
    return this.db.staff.find(s => s.id === user.staffId)!;
  }

  run<N extends OperationName>(
    userId: ID | null,
    name: N,
    input: OperationInput<N>
  ): OperationResult<N> {
    const prepared = prepareOperation(this.db, userId, name, input);
    let tracked;
    try {
      tracked = transactTracked(this.db, draft =>
        prepared.run({
          db: draft,
          now: new Date(this.now),
          actorId: prepared.actor.staff.id,
        })
      );
    } catch (error) {
      throw toOperationError(error);
    }
    applyPayload(this.shadow, toPayload(this.db, tracked.changes));
    exercised.add(name);
    return json(tracked.result) as OperationResult<N>;
  }

  /** Runs an operation that must be refused, and proves nothing changed. */
  refuse<N extends OperationName>(
    userId: ID | null,
    name: N,
    input: OperationInput<N>,
    expect: { code?: OperationErrorCode; message?: RegExp } = {}
  ): OperationError {
    const before = fingerprint(this.db);
    let error: OperationError | null = null;
    try {
      this.run(userId, name, input);
    } catch (e) {
      error = toOperationError(e);
    }
    assert.ok(error, `${name} should have been refused`);
    assert.notEqual(
      error.code,
      "INTERNAL",
      `${name} crashed instead of refusing: ${error.message}`
    );
    if (expect.code) assert.equal(error.code, expect.code, error.message);
    if (expect.message) assert.match(error.message, expect.message);
    assert.equal(
      fingerprint(this.db),
      before,
      `${name} was refused but changed the database`
    );
    return error;
  }

  assertIntact() {
    const issues = checkIntegrity(this.db);
    assert.deepEqual(
      issues,
      [],
      issues
        .slice(0, 10)
        .map(i => `${i.rule}: ${i.detail}`)
        .join("\n")
    );
  }

  /** The replayed change sets rebuilt the database exactly. */
  assertShadowMatches() {
    for (const table of Object.keys(this.db) as Array<TableName | "meta">) {
      const live = json(this.db[table]);
      const replayed = json(this.shadow[table]);
      if (!isDeepStrictEqual(live, replayed)) {
        const rows = live as unknown as Array<{ id: string }>;
        const other = replayed as unknown as Array<{ id: string }>;
        const first = Array.isArray(rows)
          ? rows.find((r, i) => !isDeepStrictEqual(r, (other as unknown[])[i]))
          : undefined;
        assert.fail(
          `change sets missed a write in ${table}${first ? ` (row ${first.id})` : ""}`
        );
      }
    }
  }

  /* ------------------------------------------------------------ */
  /* Lookups for test data                                         */
  /* ------------------------------------------------------------ */

  /**
   * A doctor rostered on a day (bookable) with a login, optionally in a
   * department. Returns the staff record and their user id.
   */
  doctorOnDuty(departmentCode?: string, daysAhead = 0) {
    const day = new Date(this.now);
    day.setDate(day.getDate() + daysAhead);
    const date = isoDate(day);
    const dept = departmentCode
      ? this.db.departments.find(d => d.code === departmentCode)
      : undefined;
    const doctor = this.db.staff.find(
      s =>
        s.role === "DOCTOR" &&
        s.status === "ACTIVE" &&
        (!dept || s.departmentId === dept.id) &&
        this.db.roster.some(
          r => r.staffId === s.id && r.date === date && r.status === "SCHEDULED"
        )
    );
    assert.ok(doctor, `no doctor on duty on ${date}`);
    const user = this.db.users.find(u => u.staffId === doctor.id);
    assert.ok(user, `doctor ${doctor.id} has no login`);
    return { doctor, userId: user.id };
  }

  medicine(code: string) {
    const m = this.db.medicines.find(x => x.code === code);
    assert.ok(m, `medicine ${code} not found`);
    return m;
  }

  labTest(code: string) {
    const t = this.db.labTests.find(x => x.code === code);
    assert.ok(t, `lab test ${code} not found`);
    return t;
  }

  /** An AVAILABLE bed whose ward suits the patient (gender / paediatric). */
  freeBedFor(gender: "MALE" | "FEMALE", wardCode?: string) {
    const bed = this.db.beds.find(b => {
      if (b.status !== "AVAILABLE") return false;
      const room = this.db.rooms.find(r => r.id === b.roomId)!;
      const ward = this.db.wards.find(w => w.id === room.wardId)!;
      if (wardCode && ward.code !== wardCode) return false;
      if (ward.restriction?.gender && ward.restriction.gender !== gender)
        return false;
      if (ward.restriction?.maxAge !== undefined) return false;
      return true;
    });
    assert.ok(bed, `no free bed for a ${gender} patient`);
    return bed;
  }
}

let counter = 0;
/** A valid new-patient form, unique per call. */
export function newPatient(
  overrides: Partial<OperationInput<"patient.register">> = {}
): OperationInput<"patient.register"> {
  counter += 1;
  const n = String(counter).padStart(3, "0");
  return {
    firstName: `Test${n}`,
    lastName: "Patient",
    gender: "MALE",
    dateOfBirth: "1984-05-12",
    phone: `90000${String(10000 + counter).slice(-5)}`,
    address: `${counter} Test Lane, Kothrud`,
    city: "Pune",
    emergencyContactName: "Kin Contact",
    emergencyContactPhone: "9811111111",
    allergies: [],
    chronicConditions: [],
    ...overrides,
  };
}

/** A real 1×1 PNG, as the browser would upload it after downscaling. */
export function pngUpload(name = "photo.png") {
  return {
    name,
    data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  };
}

/** A real one-page PDF, as a scanned document would arrive. */
export function pdfUpload(name = "scan.pdf") {
  return {
    name,
    data: onePagePdf({
      heading: "Test document",
      lines: ["Uploaded by the test suite."],
      footer: "Test data",
    }),
  };
}
