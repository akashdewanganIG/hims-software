/**
 * The server's working copy of the hospital, backed by PostgreSQL.
 *
 * PostgreSQL is the system of record. The engine keeps the committed data in
 * memory so views and the domain services run exactly as in the browser
 * sandbox, and it never holds anything PostgreSQL has not committed:
 *
 *   1. run the operation on the working copy (validated, authorised),
 *   2. capture the rows it wrote and roll the working copy back,
 *   3. commit those rows, a version bump and a change-log entry in one
 *      PostgreSQL transaction (optimistic: the version must not have moved),
 *   4. apply the committed rows to the working copy.
 *
 * Several server processes can share one database: before each operation the
 * engine replays change-log entries written by others (or reloads after a
 * reseed), and a version conflict re-runs the operation on fresh data.
 */
import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  OperationError,
  prepareOperation,
  toOperationError,
} from "../ops/execute";
import type { OperationName } from "../ops/registry";
import { isStale, reanchor } from "../sim/anchor";
import {
  applyPayload,
  isEmptyPayload,
  toPayload,
  type ChangePayload,
} from "../sim/changes";
import { transactTracked } from "../sim/journal";
import { SCHEMA_VERSION, type Database, type ID } from "../sim/schema";
import { generateDatabase } from "../sim/seed";
import { database } from "./db/client";
import { changeLog, syncState } from "./db/schema";
import {
  applyChangeSet,
  readChangesAfter,
  readSyncMeta,
  readTables,
  replaceTables,
} from "./persistence";

export interface EngineState {
  db: Database;
  epoch: string;
  version: number;
  userChanges: number;
  /** Last time the database was asked whether others have written. */
  checkedAt: number;
}

interface Engine {
  state: EngineState | null;
  queue: Promise<unknown>;
}

const g = globalThis as unknown as { __himsEngine?: Engine };
const engine: Engine = (g.__himsEngine ??= {
  state: null,
  queue: Promise.resolve(),
});

class VersionConflict extends Error {}

/** Runs `task` after every earlier engine task (one writer at a time). */
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = engine.queue.then(task, task);
  engine.queue = run.catch(() => undefined);
  return run;
}

const json = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/* ------------------------------------------------------------------ */
/* Loading, seeding and day re-anchoring                               */
/* ------------------------------------------------------------------ */

const ADVISORY_LOCK = 704_242;

/**
 * Replaces the whole data set in one transaction. `expectEpoch` guards
 * against two server processes replacing it at once: if someone else already
 * replaced it, their data set is loaded instead.
 */
async function replaceDataset(
  db: Database,
  userChanges: number,
  expectEpoch: string | null
): Promise<EngineState> {
  const epoch = randomUUID();
  let version = 0;
  const replaced = await database().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK})`);
    const current = await readSyncMeta(tx);
    if (current && expectEpoch !== null && current.epoch !== expectEpoch)
      return false;
    if (current === null && expectEpoch !== null) return false;
    version = (current?.version ?? 0) + 1;
    await replaceTables(tx, db);
    const data = {
      epoch,
      version,
      schemaVersion: db.meta.schemaVersion,
      anchoredAt: new Date(db.meta.anchoredAt).toISOString(),
      counters: db.meta.counters,
      userChanges,
      seededAt: new Date().toISOString(),
    };
    await tx
      .insert(syncState)
      .values({ id: 1, ...data })
      .onConflictDoUpdate({ target: syncState.id, set: data });
    return true;
  });
  if (!replaced) return loadState();
  return { db, epoch, version, userChanges, checkedAt: Date.now() };
}

async function loadState(): Promise<EngineState> {
  const meta = await readSyncMeta(database());
  if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
    // First run, or data written by an older schema: build a fresh hospital.
    return replaceDataset(
      generateDatabase(new Date()).db,
      0,
      meta ? meta.epoch : null
    );
  }
  const db = await readTables(database(), meta);
  return {
    db,
    epoch: meta.epoch,
    version: meta.version,
    userChanges: meta.userChanges,
    checkedAt: Date.now(),
  };
}

/** A new day: replay a fresh hospital if untouched, else move dates forward. */
async function refreshDay(state: EngineState, now: Date) {
  if (!isStale(state.db.meta.anchoredAt, now)) return state;
  if (state.userChanges === 0)
    return replaceDataset(generateDatabase(now).db, 0, state.epoch);
  reanchor(state.db, now);
  return replaceDataset(state.db, state.userChanges, state.epoch);
}

/** Replays change-log entries other server processes committed. */
async function catchUp(state: EngineState): Promise<EngineState> {
  const meta = await readSyncMeta(database());
  state.checkedAt = Date.now();
  if (!meta || meta.epoch !== state.epoch) return loadState();
  if (meta.version === state.version) return state;
  const entries = await readChangesAfter(
    database(),
    state.epoch,
    state.version
  );
  // A gap means entries were pruned: reload rather than guess.
  if (
    entries.length !== meta.version - state.version ||
    entries[0]?.version !== state.version + 1
  )
    return loadState();
  for (const entry of entries)
    applyPayload(state.db, entry.changes as unknown as ChangePayload);
  state.version = meta.version;
  state.userChanges = meta.userChanges;
  return state;
}

/**
 * The committed state, current to within `maxAgeMs` of what other server
 * processes have written. Loads (or seeds) on first use.
 */
function freshState(maxAgeMs: number): Promise<EngineState> {
  return exclusive(async () => {
    const now = new Date();
    let state = engine.state ?? (await loadState());
    if (Date.now() - state.checkedAt > maxAgeMs) state = await catchUp(state);
    state = await refreshDay(state, now);
    engine.state = state;
    return state;
  });
}

/** For reads: views may be up to a second behind other processes. */
export function readState() {
  return freshState(1_000);
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export interface OperationOutcome {
  result: unknown;
  epoch: string;
  version: number;
}

async function commit(
  state: EngineState,
  entry: {
    userId: ID;
    actorId: ID;
    operation: OperationName;
    label: string;
    silent: boolean;
  },
  payload: ChangePayload
) {
  const next = state.version + 1;
  await database().transaction(async tx => {
    const bumped = await tx
      .update(syncState)
      .set({
        version: next,
        userChanges: sql`${syncState.userChanges} + ${entry.silent ? 0 : 1}`,
        ...(payload.meta ? { counters: payload.meta.counters } : {}),
      })
      .where(
        and(
          eq(syncState.id, 1),
          eq(syncState.epoch, state.epoch),
          eq(syncState.version, state.version)
        )
      )
      .returning({ id: syncState.id });
    if (bumped.length !== 1) throw new VersionConflict();
    await applyChangeSet(tx, payload);
    await tx.insert(changeLog).values({
      version: next,
      epoch: state.epoch,
      userId: entry.userId,
      actorId: entry.actorId,
      operation: entry.operation,
      label: entry.label,
      changes: payload,
    });
  });
  return next;
}

/**
 * Validates, authorises and runs one operation as `userId`, committing its
 * changes to PostgreSQL. Throws OperationError (domain refusals included).
 */
export function runOperation(
  userId: ID | null,
  name: string,
  rawInput: unknown
): Promise<OperationOutcome> {
  return exclusive(async () => {
    const now = new Date();
    let state = engine.state ?? (await loadState());
    state = await refreshDay(await catchUp(state), now);
    engine.state = state;

    for (let attempt = 0; ; attempt += 1) {
      const prepared = prepareOperation(state.db, userId, name, rawInput);
      let payload: ChangePayload;
      let result: unknown;
      try {
        const tracked = transactTracked(state.db, draft =>
          prepared.run({
            db: draft,
            now: new Date(),
            actorId: prepared.actor.staff.id,
          })
        );
        // Copy out before rollback: results may be rows the rollback resets.
        result = json(tracked.result);
        payload = toPayload(state.db, tracked.changes);
        tracked.rollback();
      } catch (error) {
        throw toOperationError(error);
      }
      if (isEmptyPayload(payload))
        return { result, epoch: state.epoch, version: state.version };

      try {
        const version = await commit(
          state,
          {
            userId: prepared.actor.user.id,
            actorId: prepared.actor.staff.id,
            operation: prepared.name,
            label: prepared.label,
            silent: prepared.silent,
          },
          payload
        );
        applyPayload(state.db, payload);
        state.version = version;
        if (!prepared.silent) state.userChanges += 1;
        state.checkedAt = Date.now();
        return { result, epoch: state.epoch, version };
      } catch (error) {
        if (error instanceof VersionConflict && attempt < 2) {
          // Another process committed first: catch up and run again.
          state = await catchUp(state);
          engine.state = state;
          continue;
        }
        if (error instanceof VersionConflict)
          throw new OperationError(
            "CONFLICT",
            "The hospital record changed while saving. Please try again."
          );
        console.error("[hims] commit failed", error);
        throw new OperationError(
          "UNAVAILABLE",
          "The database could not save this change. Nothing was changed; try again shortly."
        );
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Administration                                                      */
/* ------------------------------------------------------------------ */

/** Replaces the hospital with a freshly replayed one. */
export function resetHospital(): Promise<{ epoch: string; version: number }> {
  return exclusive(async () => {
    const current =
      engine.state?.epoch ?? (await readSyncMeta(database()))?.epoch;
    const state = await replaceDataset(
      generateDatabase(new Date()).db,
      0,
      current ?? null
    );
    engine.state = state;
    return { epoch: state.epoch, version: state.version };
  });
}

/** Drops the working copy (tests; after out-of-band database changes). */
export function forgetState() {
  engine.state = null;
}
