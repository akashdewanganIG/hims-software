/**
 * Browser mode: the hospital lives in this browser — loaded from IndexedDB
 * (or replayed on first run), changed only through `runLocalOperation`, and
 * persisted after each change. Every viewer gets their own sandbox that
 * survives reloads. (In server mode none of this runs: data stays in
 * PostgreSQL and the browser only ever receives views.)
 */
import { prepareOperation, toOperationError } from "../ops/execute";
import { isStale, reanchor } from "./anchor";
import { transact } from "./journal";
import { SCHEMA_VERSION, type Database, type ID } from "./schema";
import { generateDatabase } from "./seed";

const DB_NAME = "hims-simulation";
const STORE = "state";
const KEY = "database";

let current: Database | null = null;
let loading: Promise<Database> | null = null;
let userChanges = 0;
const listeners = new Set<() => void>();

/* ------------------------------ IndexedDB ------------------------------ */

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readStored(): Promise<{
  db: Database;
  userChanges: number;
} | null> {
  const idb = await openIdb();
  if (!idb) return null;
  return new Promise(resolve => {
    try {
      const request = idb
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(KEY);
      request.onsuccess = () => {
        idb.close();
        resolve(
          (request.result as
            { db: Database; userChanges: number } | undefined) ?? null
        );
      };
      request.onerror = () => {
        idb.close();
        resolve(null);
      };
    } catch {
      idb.close();
      resolve(null);
    }
  });
}

async function writeStored(db: Database) {
  const idb = await openIdb();
  if (!idb) return;
  await new Promise<void>(resolve => {
    // Each save opens its own connection; close it when the write settles.
    const done = () => {
      idb.close();
      resolve();
    };
    try {
      const tx = idb.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ db, userChanges }, KEY);
      tx.oncomplete = done;
      tx.onerror = done;
      tx.onabort = done;
    } catch {
      done();
    }
  });
}

/**
 * Saves right after each change — a reload, a new tab (print views) or
 * closing the tab must never lose it. Changes made while a save is running
 * are coalesced into one more save.
 */
let saving: Promise<void> | null = null;
let dirty = false;
function schedulePersist() {
  dirty = true;
  if (saving) return;
  saving = (async () => {
    while (dirty && current) {
      dirty = false;
      await writeStored(current);
    }
    saving = null;
  })();
}

// Last chance when the page is hidden or unloaded mid-save.
if (typeof window !== "undefined")
  window.addEventListener("pagehide", () => {
    if (dirty && current) void writeStored(current);
  });

/* ------------------------------- generation ---------------------------- */

/** Seed in a Web Worker when available; fall back to the main thread. */
function generate(now: Date): Promise<Database> {
  if (typeof Worker === "undefined")
    return Promise.resolve(generateDatabase(now).db);
  return new Promise(resolve => {
    try {
      const worker = new Worker(new URL("./seed.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<Database>) => {
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = () => {
        worker.terminate();
        resolve(generateDatabase(now).db);
      };
      worker.postMessage({ now: now.toISOString() });
    } catch {
      resolve(generateDatabase(now).db);
    }
  });
}

/* -------------------------------- public ------------------------------- */

export interface SimulationInfo {
  anchoredAt: string;
  userChanges: number;
}

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDb(): Database {
  if (!current) throw new Error("Simulation not loaded yet");
  return current;
}

export function simulationInfo(): SimulationInfo {
  return { anchoredAt: getDb().meta.anchoredAt, userChanges };
}

export function loadDatabase(): Promise<Database> {
  if (current) return Promise.resolve(current);
  if (loading) return loading;
  loading = (async () => {
    const now = new Date();
    const stored = await readStored();
    let db: Database;
    if (stored && stored.db.meta.schemaVersion === SCHEMA_VERSION) {
      db = stored.db;
      userChanges = stored.userChanges ?? 0;
      if (isStale(db.meta.anchoredAt, now)) {
        if (userChanges === 0) {
          // Untouched sandbox from an earlier day: replay a fresh one instead.
          db = await generate(now);
        } else {
          reanchor(db, now);
        }
        void writeStored(db);
      }
    } else {
      db = await generate(now);
      userChanges = 0;
      void writeStored(db);
    }
    current = db;
    loading = null;
    emit();
    return db;
  })();
  return loading;
}

export async function resetSimulation() {
  const db = await generate(new Date());
  current = db;
  userChanges = 0;
  await writeStored(db);
  emit();
  return db;
}

/**
 * Runs one named operation as `userId` against the sandbox — validated,
 * authorised and atomic exactly as on the server. Throws OperationError and
 * leaves the data untouched when anything refuses the change. The result is
 * returned as plain JSON, the same shape the server sends.
 */
export function runLocalOperation(
  userId: ID | null,
  name: string,
  input: unknown
): unknown {
  const db = getDb();
  const prepared = prepareOperation(db, userId, name, input);
  let result: unknown;
  try {
    result = transact(db, draft =>
      prepared.run({
        db: draft,
        now: new Date(),
        actorId: prepared.actor.staff.id,
      })
    );
  } catch (error) {
    const failure = toOperationError(error);
    if (failure.code === "INTERNAL") console.error(error);
    throw failure;
  }
  if (!prepared.silent) userChanges += 1;
  schedulePersist();
  if (!prepared.silent) emit();
  return result === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(result)) as unknown);
}
