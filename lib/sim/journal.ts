/**
 * Atomic transactions without copying the database.
 *
 * The domain services mutate rows in place. `transact` hands them a proxy of
 * the database that records every write (property sets, deletes, array
 * pushes/splices, whole-table replacement) in an undo journal. If the
 * operation throws, the journal is replayed in reverse and the database is
 * exactly as it was; if it succeeds, the journal is dropped. Values written
 * through the proxy are unwrapped, so no proxy ever leaks into stored data.
 *
 * `transactTracked` additionally reports what changed — the rows inserted or
 * updated and the ids removed, per table — so the server can persist exactly
 * those rows to PostgreSQL and hand the same change set to every client.
 */

type AnyRecord = Record<PropertyKey, unknown>;
type Row = { id: string } & AnyRecord;

/** Rows written (final state) and ids removed, per table. */
export interface ChangeSet {
  upserts: Record<string, Row[]>;
  deletes: Record<string, string[]>;
  /** Root-level objects that are not tables (the `meta` block) that changed. */
  singles: string[];
}

/** Where a proxied object sits in the database tree. */
type Context =
  | { kind: "root" }
  | { kind: "table"; table: string }
  | { kind: "row"; table: string; row: object }
  | { kind: "single"; key: string };

const isIndex = (key: PropertyKey) =>
  typeof key === "string" && key !== "" && String(Number(key) >>> 0) === key;

interface Tracker {
  dirty: Map<string, Set<object>>;
  snapshots: Map<string, { ids: Set<string>; rows: Set<object> }>;
  singles: Set<string>;
}

function run<T extends object, R>(
  root: T,
  fn: (draft: T) => R,
  track: boolean
) {
  const undo: Array<() => void> = [];
  const proxies = new WeakMap<object, object>();
  const targets = new WeakMap<object, object>();
  const contexts = new WeakMap<object, Context>();
  const tracker: Tracker | null = track
    ? { dirty: new Map(), snapshots: new Map(), singles: new Set() }
    : null;

  const markRow = (table: string, row: object) => {
    if (!tracker) return;
    let set = tracker.dirty.get(table);
    if (!set) tracker.dirty.set(table, (set = new Set()));
    set.add(row);
  };
  const snapshot = (table: string, rows: unknown) => {
    if (!tracker || tracker.snapshots.has(table) || !Array.isArray(rows))
      return;
    tracker.snapshots.set(table, {
      ids: new Set(rows.map(r => (r as Row).id)),
      rows: new Set(rows as object[]),
    });
  };

  const unwrap = (value: unknown, depth = 0): unknown => {
    if (value === null || typeof value !== "object") return value;
    const target = targets.get(value as object);
    if (target) return target;
    if (depth > 6) return value;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        const next = unwrap(item, depth + 1);
        if (next !== item) value[i] = next;
      }
      return value;
    }
    if (Object.getPrototypeOf(value) === Object.prototype) {
      const record = value as AnyRecord;
      for (const key of Object.keys(record)) {
        const item = record[key];
        const next = unwrap(item, depth + 1);
        if (next !== item) record[key] = next;
      }
    }
    return value;
  };

  const childContext = (
    parent: Context | undefined,
    key: PropertyKey,
    value: object
  ): Context | undefined => {
    if (!parent || typeof key === "symbol") return undefined;
    switch (parent.kind) {
      case "root":
        return Array.isArray(value)
          ? { kind: "table", table: String(key) }
          : { kind: "single", key: String(key) };
      case "table":
        return isIndex(key)
          ? { kind: "row", table: parent.table, row: value }
          : undefined;
      case "row":
      case "single":
        return parent;
    }
  };

  /** Record that `target` (known by its context) is about to be written. */
  const noteWrite = (
    target: AnyRecord,
    key: PropertyKey,
    next: unknown,
    isDelete: boolean
  ) => {
    if (!tracker) return;
    const ctx = contexts.get(target);
    if (!ctx) return;
    switch (ctx.kind) {
      case "root": {
        // A whole table replaced, e.g. `db.labResults = db.labResults.filter(…)`.
        const table = String(key);
        if (Array.isArray(target[key])) snapshot(table, target[key]);
        else tracker.singles.add(table);
        return;
      }
      case "table": {
        const rows = target as unknown as unknown[];
        const appending =
          !isDelete && isIndex(key) && Number(key) >= rows.length;
        const growing =
          !isDelete && key === "length" && Number(next) >= rows.length;
        if (!appending && !growing) snapshot(ctx.table, rows);
        if (!isDelete && isIndex(key) && next && typeof next === "object") {
          const known = tracker.snapshots.get(ctx.table)?.rows.has(next);
          if (!known) markRow(ctx.table, next);
        }
        return;
      }
      case "row":
        markRow(ctx.table, ctx.row);
        return;
      case "single":
        tracker.singles.add(ctx.key);
        return;
    }
  };

  const wrap = (value: unknown, parent?: Context, key?: PropertyKey) => {
    if (value === null || typeof value !== "object") return value;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype
    )
      return value;
    const existing = proxies.get(value);
    if (existing) return existing;
    if (tracker && !contexts.has(value)) {
      const ctx =
        key === undefined
          ? { kind: "root" as const }
          : childContext(parent, key, value);
      if (ctx) contexts.set(value, ctx);
    }
    const proxy = new Proxy(value as AnyRecord, {
      get(target, prop) {
        const v = Reflect.get(target, prop);
        return typeof v === "function"
          ? v
          : wrap(v, contexts.get(target), prop);
      },
      set(target, prop, next) {
        const had = Object.prototype.hasOwnProperty.call(target, prop);
        const previous = target[prop];
        // Writing an array index can grow `length` implicitly; restore it too.
        const previousLength = Array.isArray(target)
          ? target.length
          : undefined;
        const raw = unwrap(next);
        noteWrite(target, prop, raw, false);
        undo.push(() => {
          if (had) target[prop] = previous;
          else delete target[prop];
          if (previousLength !== undefined)
            (target as unknown as unknown[]).length = previousLength;
        });
        target[prop] = raw;
        return true;
      },
      deleteProperty(target, prop) {
        if (!Object.prototype.hasOwnProperty.call(target, prop)) return true;
        const previous = target[prop];
        noteWrite(target, prop, undefined, true);
        undo.push(() => {
          target[prop] = previous;
        });
        delete target[prop];
        return true;
      },
    });
    proxies.set(value, proxy);
    targets.set(proxy, value);
    return proxy;
  };

  const rollback = () => {
    for (let i = undo.length - 1; i >= 0; i -= 1) undo[i]!();
    undo.length = 0;
  };

  let result: R;
  try {
    result = unwrap(fn(wrap(root) as T)) as R;
  } catch (error) {
    rollback();
    throw error;
  }

  let changes: ChangeSet | undefined;
  if (tracker) {
    changes = { upserts: {}, deletes: {}, singles: [...tracker.singles] };
    const db = root as unknown as Record<string, unknown>;
    const tables = new Set([
      ...tracker.dirty.keys(),
      ...tracker.snapshots.keys(),
    ]);
    for (const table of tables) {
      const current = Array.isArray(db[table]) ? (db[table] as Row[]) : [];
      const before = tracker.snapshots.get(table);
      const upserts = new Map<string, Row>();
      if (before) {
        const present = new Set(current.map(r => r.id));
        const removed = [...before.ids].filter(id => !present.has(id));
        if (removed.length) changes.deletes[table] = removed;
        for (const row of current)
          if (!before.rows.has(row)) upserts.set(row.id, row);
      }
      const dirty = tracker.dirty.get(table);
      if (dirty) {
        const live = before ? new Set<object>(current) : null;
        for (const row of dirty)
          if (!live || live.has(row)) upserts.set((row as Row).id, row as Row);
      }
      if (upserts.size) changes.upserts[table] = [...upserts.values()];
    }
  }

  return { result, changes, rollback };
}

export function transact<T extends object, R>(root: T, fn: (draft: T) => R): R {
  return run(root, fn, false).result;
}

/**
 * Like `transact`, and also returns the change set and a `rollback` that
 * undoes the committed writes — valid until the next transaction on the same
 * data, which lets a server roll back when persisting the change fails.
 */
export function transactTracked<T extends object, R>(
  root: T,
  fn: (draft: T) => R
): { result: R; changes: ChangeSet; rollback: () => void } {
  const { result, changes, rollback } = run(root, fn, true);
  return { result, changes: changes!, rollback };
}
