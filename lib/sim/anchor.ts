/**
 * Keeping a stored hospital "live": the seed replays history up to the moment
 * it runs, so a data set from an earlier day is either replaced (untouched) or
 * moved forward by whole days (changed by users) so today's queues, rosters
 * and trends stay current. Shared by the browser sandbox and the server.
 */
import type { Database } from "./schema";
import { DAY, isoDate, startOfDay } from "./time";

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Dates of record that do not move with the clock. */
const FIXED_KEYS = new Set(["dateOfBirth", "joinedOn"]);

function shiftValue(value: string, days: number): string {
  if (ISO_DATETIME.test(value)) {
    const d = new Date(value);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  const [y, m, dd] = value.split("-").map(Number);
  return isoDate(new Date(y ?? 1970, (m ?? 1) - 1, (dd ?? 1) + days));
}

function shiftTree(node: unknown, days: number): void {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const item = node[i];
      if (
        typeof item === "string" &&
        (ISO_DATETIME.test(item) || ISO_DATE.test(item))
      )
        node[i] = shiftValue(item, days);
      else shiftTree(item, days);
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === "string") {
      if (FIXED_KEYS.has(key)) continue;
      if (ISO_DATETIME.test(value) || ISO_DATE.test(value))
        record[key] = shiftValue(value, days);
    } else if (value && typeof value === "object") {
      shiftTree(value, days);
    }
  }
}

/** True when the data set was anchored on an earlier calendar day. */
export function isStale(anchoredAt: string, now: Date) {
  return isoDate(anchoredAt) !== isoDate(now);
}

/**
 * Moves every timestamp forward by the whole days between the anchor and
 * `now`. Returns the number of days moved (0 when already current).
 */
export function reanchor(db: Database, now: Date): number {
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(db.meta.anchoredAt).getTime()) / DAY
  );
  if (days <= 0) return 0;
  const { meta, ...tables } = db;
  shiftTree(tables, days);
  meta.anchoredAt = new Date(
    new Date(meta.anchoredAt).getTime() + days * DAY
  ).toISOString();
  return days;
}
