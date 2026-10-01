/**
 * Moves rows between the application's in-memory tables and PostgreSQL.
 *
 * The Drizzle tables mirror `lib/sim/schema.ts` field for field (property
 * names are the row keys), so the conversion is generic, driven by the
 * column definitions: timestamps ⇄ ISO strings, dates stay YYYY-MM-DD,
 * numerics ⇄ numbers, absent ⇄ NULL.
 */
import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  getTableName,
  gt,
  inArray,
  sql,
  type Column,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { ChangePayload } from "../sim/changes";
import type { Database, TableName } from "../sim/schema";
import type { Db } from "./db/client";
import * as schema from "./db/schema";

type Row = Record<string, unknown> & { id: string };

/** Application table → Drizzle table (the same names). */
export const TABLE_SCHEMA = {
  departments: schema.departments,
  staff: schema.staff,
  roles: schema.roles,
  users: schema.users,
  patients: schema.patients,
  enquiries: schema.enquiries,
  enquiryFollowUps: schema.enquiryFollowUps,
  appointments: schema.appointments,
  encounters: schema.encounters,
  wards: schema.wards,
  rooms: schema.rooms,
  beds: schema.beds,
  admissions: schema.admissions,
  bedAssignments: schema.bedAssignments,
  clinicalNotes: schema.clinicalNotes,
  careOrders: schema.careOrders,
  dischargeSummaries: schema.dischargeSummaries,
  medicines: schema.medicines,
  medicineBatches: schema.medicineBatches,
  prescriptions: schema.prescriptions,
  prescriptionItems: schema.prescriptionItems,
  pharmacyTransactions: schema.pharmacyTransactions,
  labTests: schema.labTests,
  labOrders: schema.labOrders,
  labOrderItems: schema.labOrderItems,
  labResults: schema.labResults,
  invoices: schema.invoices,
  invoiceItems: schema.invoiceItems,
  payments: schema.payments,
  medicalRecords: schema.medicalRecords,
  recordAccessLogs: schema.recordAccessLogs,
  documents: schema.documents,
  files: schema.files,
  complaints: schema.complaints,
  complaintNotes: schema.complaintNotes,
  feedback: schema.feedback,
  shifts: schema.shifts,
  roster: schema.roster,
  activity: schema.activity,
} as const satisfies Record<TableName, PgTable>;

export const TABLES = Object.keys(TABLE_SCHEMA) as TableName[];

/** A table as the generic code sees it: every one has `id` and `seq`. */
type AnyTable = PgTable & { id: PgColumn; seq: PgColumn };
const tableOf = (table: TableName) =>
  TABLE_SCHEMA[table] as unknown as AnyTable;

export function tableName(table: TableName) {
  return getTableName(TABLE_SCHEMA[table]);
}

/* ------------------------------------------------------------------ */
/* Field metadata                                                      */
/* ------------------------------------------------------------------ */

interface Field {
  /** Row key and Drizzle property. */
  key: string;
  /** Column name in PostgreSQL. */
  column: string;
  required: boolean;
  /** A `timestamp` column, exchanged as ISO-8601 in the application. */
  instant: boolean;
}

const fieldCache = new Map<TableName, Field[]>();

/** The columns rows carry (everything but the insertion-order `seq`). */
export function fields(table: TableName): Field[] {
  const cached = fieldCache.get(table);
  if (cached) return cached;
  const columns = getTableColumns(TABLE_SCHEMA[table]) as Record<
    string,
    Column
  >;
  const list = Object.entries(columns)
    .filter(([key]) => key !== "seq")
    .map(([key, column]) => ({
      key,
      column: column.name,
      required: column.notNull,
      instant: column.columnType === "PgTimestampString",
    }));
  fieldCache.set(table, list);
  return list;
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

/**
 * PostgreSQL's text form of a `timestamp` ("2026-09-30 10:15:00.12") → the
 * ISO string the application uses. Stored values are UTC wall-clock times.
 */
export function instantToIso(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Not a timestamp: ${value}`);
  return date.toISOString();
}

function checkInstant(
  value: unknown,
  table: TableName,
  key: string,
  id: unknown
) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new Error(
      `${table}.${key} on ${String(id)} is not a valid date: ${String(value)}`
    );
  // Timestamps are stored as UTC wall-clock time.
  return new Date(value).toISOString();
}

/** Application row → Drizzle values; absent fields become NULL. */
export function toRecord(table: TableName, row: Row): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields(table)) {
    const value = row[field.key];
    if (value === undefined || value === null) data[field.key] = null;
    else if (field.instant)
      data[field.key] = checkInstant(value, table, field.key, row.id);
    else data[field.key] = value;
  }
  return data;
}

/** Drizzle record → application row (NULL columns become absent keys). */
export function toRow(table: TableName, record: Record<string, unknown>): Row {
  const row: Record<string, unknown> = {};
  for (const field of fields(table)) {
    const value = record[field.key];
    if (value === null || value === undefined) continue;
    row[field.key] = field.instant ? instantToIso(value as string) : value;
  }
  return row as Row;
}

/* ------------------------------------------------------------------ */
/* Reading and writing                                                 */
/* ------------------------------------------------------------------ */

export interface SyncMeta {
  epoch: string;
  version: number;
  schemaVersion: number;
  anchoredAt: string;
  counters: Record<string, number>;
  userChanges: number;
}

export async function readSyncMeta(db: Db): Promise<SyncMeta | null> {
  const [row] = await db
    .select()
    .from(schema.syncState)
    .where(eq(schema.syncState.id, 1))
    .limit(1);
  if (!row) return null;
  return {
    epoch: row.epoch,
    version: row.version,
    schemaVersion: row.schemaVersion,
    anchoredAt: instantToIso(row.anchoredAt),
    counters: (row.counters ?? {}) as Record<string, number>,
    userChanges: row.userChanges,
  };
}

/** Every table, in insertion order. */
export async function readTables(db: Db, meta: SyncMeta): Promise<Database> {
  const entries = await Promise.all(
    TABLES.map(async table => {
      const t = tableOf(table);
      const records = (await db.select().from(t).orderBy(asc(t.seq))) as Array<
        Record<string, unknown>
      >;
      return [table, records.map(r => toRow(table, r))] as const;
    })
  );
  return {
    meta: {
      schemaVersion: meta.schemaVersion,
      anchoredAt: meta.anchoredAt,
      counters: { ...meta.counters },
    },
    ...Object.fromEntries(entries),
  } as Database;
}

/**
 * Rows per INSERT, kept well under PostgreSQL's 65,535 parameters — and few
 * for files, whose rows carry their content and can be megabytes each.
 */
const chunkSize = (table: TableName) =>
  table === "files"
    ? 10
    : Math.max(1, Math.floor(30_000 / fields(table).length));

/**
 * Replaces the whole data set (seed, reseed, day re-anchoring). Runs inside
 * the caller's transaction; foreign keys are checked at commit.
 */
export async function replaceTables(tx: Db, db: Database) {
  const names = TABLES.map(t => `"${tableName(t)}"`).join(", ");
  await tx.execute(
    sql.raw(`TRUNCATE TABLE ${names}, "change_log" RESTART IDENTITY`)
  );
  for (const table of TABLES) {
    const rows = db[table] as unknown as Row[];
    const size = chunkSize(table);
    for (let i = 0; i < rows.length; i += size)
      await tx
        .insert(tableOf(table))
        .values(rows.slice(i, i + size).map(r => toRecord(table, r)));
  }
}

/**
 * Persists one operation's changes: removals first (so a replaced row cannot
 * collide on a unique key), then one upsert per table of each row's final
 * state.
 */
export async function applyChangeSet(
  tx: Db,
  changes: Pick<ChangePayload, "upserts" | "deletes">
) {
  for (const [table, ids] of Object.entries(changes.deletes) as Array<
    [TableName, string[]]
  >) {
    if (ids.length) {
      const t = tableOf(table);
      await tx.delete(t).where(inArray(t.id, ids));
    }
  }
  for (const [table, rows] of Object.entries(changes.upserts) as Array<
    [TableName, Row[]]
  >) {
    if (!rows.length) continue;
    const t = tableOf(table);
    const set = Object.fromEntries(
      fields(table)
        .filter(f => f.key !== "id")
        .map(f => [f.key, sql.raw(`excluded."${f.column}"`)])
    );
    const size = chunkSize(table);
    for (let i = 0; i < rows.length; i += size)
      await tx
        .insert(t)
        .values(rows.slice(i, i + size).map(r => toRecord(table, r)))
        .onConflictDoUpdate({ target: t.id, set });
  }
}

/** Change-log entries after `version` for the data set `epoch`. */
export function readChangesAfter(db: Db, epoch: string, version: number) {
  return db
    .select()
    .from(schema.changeLog)
    .where(
      and(
        eq(schema.changeLog.epoch, epoch),
        gt(schema.changeLog.version, version)
      )
    )
    .orderBy(asc(schema.changeLog.version));
}

/** Row counts per table (health checks, the verifier). */
export async function countTables(db: Db) {
  const counts = await Promise.all(
    TABLES.map(async table => {
      const [row] = await db.select({ n: count() }).from(tableOf(table));
      return [table, row?.n ?? 0] as const;
    })
  );
  return Object.fromEntries(counts) as Record<TableName, number>;
}
