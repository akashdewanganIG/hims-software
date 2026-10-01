/**
 * Server configuration, validated once. Only route handlers and CLI scripts
 * import `lib/server/*`; nothing here reaches the browser bundle.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .catch("development")
    .default("development"),
  /** The app's connection — Neon's pooled URL when hosted on Neon. */
  DATABASE_URL: z.string().trim().optional(),
  /** Direct (non-pooled) connection for migrations and Drizzle Studio. */
  DIRECT_URL: z.string().trim().optional(),
  /**
   * Test tooling only: route the Neon driver through a WebSocket proxy to
   * exercise it against local PostgreSQL.
   */
  NEON_WS_PROXY: z.string().trim().optional(),
  SESSION_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

export function serverEnv(): ServerEnv {
  return schema.parse(process.env);
}

export type DataMode = "server" | "browser";

/** "server" when PostgreSQL is the system of record, else "browser". */
export function dataMode(env = serverEnv()): DataMode {
  return env.DATABASE_URL ? "server" : "browser";
}

/** Problems that stop server mode from working at all. */
export function configurationProblems(env = serverEnv()): string[] {
  const problems: string[] = [];
  if (dataMode(env) !== "server") return problems;
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set.");
  else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL))
    problems.push("DATABASE_URL must be a postgresql:// URL.");
  if (env.NODE_ENV === "production" && (env.SESSION_SECRET ?? "").length < 32)
    problems.push(
      "SESSION_SECRET must be set to at least 32 characters in production."
    );
  return problems;
}

const DEV_SESSION_SECRET = "hims-development-session-secret-not-for-production";

export function sessionSecret(env = serverEnv()): string {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32)
    return env.SESSION_SECRET;
  if (env.NODE_ENV === "production")
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  return DEV_SESSION_SECRET;
}

export function resetAllowed(env = serverEnv()) {
  return env.NODE_ENV !== "production";
}
