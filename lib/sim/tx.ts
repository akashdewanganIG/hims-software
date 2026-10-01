import type {
  ActivityEvent,
  Database,
  EntityType,
  ID,
  ISODateTime,
} from "./schema";

/**
 * A domain rule was violated (bed not free, stock insufficient, invalid
 * status transition…). Mutations throw this; the transaction is discarded and
 * the message is shown to the user as-is, so it must read as plain guidance.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Everything a domain operation needs: the working copy of the database, the
 * clock and who is acting. Injecting the clock lets the seed replay weeks of
 * hospital activity through the very same services the UI calls.
 */
export interface Tx {
  db: Database;
  now: Date;
  actorId: ID;
}

export function nowIso(tx: Tx): ISODateTime {
  return tx.now.toISOString();
}

function bump(tx: Tx, key: string): number {
  const next = (tx.db.meta.counters[key] ?? 0) + 1;
  tx.db.meta.counters[key] = next;
  return next;
}

/** Stable, deterministic row id. */
export function newId(tx: Tx, prefix: string): ID {
  return `${prefix}_${bump(tx, `id:${prefix}`).toString(36)}`;
}

/** Human-facing reference number, e.g. APT-2409-00042. */
export function nextCode(tx: Tx, prefix: string, width = 5): string {
  const n = bump(tx, `code:${prefix}`);
  const yymm = `${String(tx.now.getFullYear()).slice(2)}${String(
    tx.now.getMonth() + 1
  ).padStart(2, "0")}`;
  return `${prefix}-${yymm}-${String(n).padStart(width, "0")}`;
}

export function find<T extends { id: ID }>(
  rows: T[],
  id: ID | undefined
): T | undefined {
  if (!id) return undefined;
  return rows.find(row => row.id === id);
}

export function must<T extends { id: ID }>(
  rows: T[],
  id: ID | undefined,
  label: string
): T {
  const row = find(rows, id);
  if (!row) throw new DomainError(`${label} was not found.`);
  return row;
}

export function touch<T extends { updatedAt: ISODateTime }>(tx: Tx, row: T) {
  row.updatedAt = nowIso(tx);
  return row;
}

export function log(
  tx: Tx,
  event: {
    entityType: EntityType;
    entityId: ID;
    patientId?: ID;
    action: string;
    summary: string;
  }
): ActivityEvent {
  const row: ActivityEvent = {
    id: newId(tx, "evt"),
    at: nowIso(tx),
    actorId: tx.actorId,
    ...event,
  };
  tx.db.activity.push(row);
  return row;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(message);
}

export function requireText(value: string | undefined, label: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new DomainError(`${label} is required.`);
  return trimmed;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}
