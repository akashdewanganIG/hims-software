import { minutesBetween } from "./sim/time";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹1,23,456.50 — Indian digit grouping. */
export function formatINR(
  value: number | null | undefined,
  whole = false
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return (whole ? inrWhole : inr).format(value);
}

/** ₹12.4 L / ₹1.2 Cr for dashboards. */
export function formatINRCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(1)} L`;
  if (abs >= 1e3) return `₹${(value / 1e3).toFixed(1)}k`;
  return formatINR(value, true);
}

export function formatNumber(value: number, digits = 0) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d =
    typeof value === "string" && value.length === 10
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";
  const d =
    typeof value === "string" && value.length === 10
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateTime(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** "12 min", "3 h 5 min", "2 d 4 h". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

export function formatRelative(value: string | Date, now = new Date()): string {
  const minutes = minutesBetween(value, now);
  if (Math.abs(minutes) < 1) return "just now";
  if (minutes > 0) return `${formatDuration(minutes)} ago`;
  return `in ${formatDuration(-minutes)}`;
}

export function formatGender(gender: string) {
  return gender === "MALE" ? "M" : gender === "FEMALE" ? "F" : "O";
}

/** Indian mobile display: 98765 43210. */
export function formatPhone(phone: string | undefined) {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

const ACRONYMS = new Set([
  "OPD",
  "IPD",
  "HDU",
  "UPI",
  "MRD",
  "ID",
  "IV",
  "IM",
  "SC",
  "OD",
  "BD",
  "TDS",
  "QID",
  "HS",
  "SOS",
  "STAT",
  "ENT",
  "NS1",
]);

/** SEMI_PRIVATE → "Semi private"; keeps clinical acronyms upper-case. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word, index) => {
      if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      const lower = word.toLowerCase();
      return index === 0
        ? lower.charAt(0).toUpperCase() + lower.slice(1)
        : lower;
    })
    .join(" ");
}

export function initials(name: string) {
  return (
    name
      .replace(/^Dr\.?\s+/i, "")
      .split(/\s+/)
      .map(part => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
