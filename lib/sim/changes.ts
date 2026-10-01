/**
 * A committed change in portable form: the final state of every row an
 * operation wrote, the ids it removed, and the `meta` block when counters
 * moved. The server persists it, logs it and applies it to its working copy.
 */
import type { ChangeSet } from "./journal";
import type { Database, TableName } from "./schema";

type Row = { id: string } & Record<string, unknown>;

export interface ChangePayload {
  upserts: Partial<Record<TableName, Row[]>>;
  deletes: Partial<Record<TableName, string[]>>;
  meta?: Database["meta"];
}

/** Snapshot a tracked change set (deep copy, JSON-safe) before rollback. */
export function toPayload(db: Database, changes: ChangeSet): ChangePayload {
  const payload: ChangePayload = {
    upserts: JSON.parse(
      JSON.stringify(changes.upserts)
    ) as ChangePayload["upserts"],
    deletes: { ...changes.deletes } as ChangePayload["deletes"],
  };
  if (changes.singles.includes("meta"))
    payload.meta = JSON.parse(JSON.stringify(db.meta)) as Database["meta"];
  return payload;
}

export function isEmptyPayload(payload: ChangePayload) {
  return (
    !payload.meta &&
    Object.values(payload.upserts).every(rows => !rows?.length) &&
    Object.values(payload.deletes).every(ids => !ids?.length)
  );
}

/** Writes a payload into a database: removals, then replace-or-append by id. */
export function applyPayload(db: Database, payload: ChangePayload) {
  for (const [table, ids] of Object.entries(payload.deletes) as Array<
    [TableName, string[]]
  >) {
    if (!ids?.length) continue;
    const gone = new Set(ids);
    const rows = db[table] as unknown as Row[];
    (db as unknown as Record<string, Row[]>)[table] = rows.filter(
      r => !gone.has(r.id)
    );
  }
  for (const [table, rows] of Object.entries(payload.upserts) as Array<
    [TableName, Row[]]
  >) {
    if (!rows?.length) continue;
    const list = db[table] as unknown as Row[];
    const index = new Map(list.map((r, i) => [r.id, i]));
    for (const row of rows) {
      const copy = structuredClone(row);
      const at = index.get(row.id);
      if (at === undefined) {
        index.set(row.id, list.length);
        list.push(copy);
      } else {
        list[at] = copy;
      }
    }
  }
  if (payload.meta) db.meta = structuredClone(payload.meta);
}
