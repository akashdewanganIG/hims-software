import type { ISODate, ISODateTime } from "./schema";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Local calendar date (YYYY-MM-DD) — the hospital's day, not UTC's. */
export function isoDate(value: Date | ISODateTime): ISODate {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Midnight local time for an ISO date string. */
export function fromIsoDate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(value: Date | ISODateTime): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(value: Date, days: number): Date {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * MINUTE);
}

export function atTime(day: Date, hours: number, minutes = 0): Date {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function isSameDay(a: Date | ISODateTime, b: Date | ISODateTime) {
  return isoDate(a) === isoDate(b);
}

export function addDaysIso(date: ISODate, days: number): ISODate {
  return isoDate(addDays(fromIsoDate(date), days));
}

export function minutesBetween(
  from: Date | ISODateTime,
  to: Date | ISODateTime
): number {
  return Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / MINUTE
  );
}

export function hoursBetween(
  from: Date | ISODateTime,
  to: Date | ISODateTime
): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / HOUR;
}

/** Whole calendar days a stay spans, minimum one — how bed-days are billed. */
export function bedDays(from: ISODateTime, to: ISODateTime): number {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  return Math.max(1, Math.round((end - start) / DAY));
}

export function ageInYears(dateOfBirth: ISODate, at: Date = new Date()) {
  const dob = fromIsoDate(dateOfBirth);
  let age = at.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    at.getMonth() < dob.getMonth() ||
    (at.getMonth() === dob.getMonth() && at.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/** "HH:mm" → minutes after midnight. */
export function clockMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Whether `at` falls inside a shift window that may cross midnight. */
export function withinShift(
  at: Date,
  shiftDate: ISODate,
  start: string,
  end: string
): boolean {
  const base = fromIsoDate(shiftDate);
  const from = addMinutes(base, clockMinutes(start));
  let to = addMinutes(base, clockMinutes(end));
  if (to <= from) to = addDays(to, 1);
  return at >= from && at < to;
}

/** Monday of the week containing `value`. */
export function startOfWeek(value: Date): Date {
  const d = startOfDay(value);
  const weekday = (d.getDay() + 6) % 7;
  return addDays(d, -weekday);
}
