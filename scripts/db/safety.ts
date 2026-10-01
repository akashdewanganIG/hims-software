/**
 * Guards for commands that delete data — the same two-key scheme as Ralli
 * Wolf's seed-safety: an explicit acknowledgement plus the exact target
 * database, both set for the one invocation, and never in production.
 */
const DESTRUCTIVE_CONFIRMATION = "I_UNDERSTAND_THIS_DELETES_DATA";

export function targetDatabase(label: string) {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error(`${label} requires DIRECT_URL or DATABASE_URL`);
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error(`${label} requires a valid database URL`);
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol))
    throw new Error(`${label} only supports a PostgreSQL database URL`);
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!target.hostname || !database || database.includes("/"))
    throw new Error(`${label} could not identify the target database`);
  return `${target.hostname}:${target.port || "5432"}/${database}`;
}

export function assertDestructiveDatabaseAllowed(label: string) {
  if (process.env.NODE_ENV === "production")
    throw new Error(`${label} is disabled when NODE_ENV=production`);
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== DESTRUCTIVE_CONFIRMATION)
    throw new Error(
      `${label} deletes hospital data. Set ALLOW_DESTRUCTIVE_SEED=${DESTRUCTIVE_CONFIRMATION} for this invocation.`
    );
  const expected = targetDatabase(label);
  if (process.env.DESTRUCTIVE_DATABASE_CONFIRM !== expected)
    throw new Error(
      `${label} targets ${expected}. Set DESTRUCTIVE_DATABASE_CONFIRM=${expected} for this invocation.`
    );
}

/** Loads .env (if present) and pins the hospital's time zone for CLI runs. */
export async function prepareCli() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Environment supplied by the shell or CI.
  }
  const { HOSPITAL } = await import("../../lib/sim/reference");
  process.env.TZ = HOSPITAL.timeZone;
}
