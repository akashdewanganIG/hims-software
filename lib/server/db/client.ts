/**
 * The PostgreSQL connection behind one Drizzle interface.
 *
 * Neon (the hosted database) is reached with Neon's serverless driver over
 * WebSockets; any other PostgreSQL — the local one from `npm run db:up`, the
 * CI service — with node-postgres over TCP. Both speak the same Drizzle API
 * and support interactive transactions, which the engine relies on.
 */
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import ws from "ws";

import { serverEnv, type ServerEnv } from "../env";

export type Db = PgDatabase<PgQueryResultHKT>;
export type DatabaseDriver = "neon" | "pg";

export interface Connection {
  db: Db;
  driver: DatabaseDriver;
  close: () => Promise<void>;
}

/** Neon URLs use its WebSocket driver; all other PostgreSQL uses TCP. */
export function databaseDriver(
  url: string,
  env: Pick<ServerEnv, "NEON_WS_PROXY"> = serverEnv()
): DatabaseDriver {
  // The local proxy exists only to run the suite through Neon's driver.
  if (env.NEON_WS_PROXY) return "neon";
  try {
    return new URL(url).hostname.endsWith(".neon.tech") ? "neon" : "pg";
  } catch {
    return "pg";
  }
}

/** The direct (non-pooled) URL for migrations, falling back to DATABASE_URL. */
export function directUrl(env: ServerEnv = serverEnv()) {
  return env.DIRECT_URL || env.DATABASE_URL || "";
}

const logIdleError = (error: Error) =>
  // An idle connection dropped (e.g. Neon scaling to zero). The pool
  // replaces it on next use; without a listener it would crash the process.
  console.warn(`[hims] database connection closed: ${error.message}`);

export function connect(url: string, { max = 5 } = {}): Connection {
  const env = serverEnv();
  const driver = databaseDriver(url, env);
  if (driver === "neon") {
    neonConfig.webSocketConstructor = ws;
    if (env.NEON_WS_PROXY) {
      neonConfig.wsProxy = env.NEON_WS_PROXY;
      neonConfig.useSecureWebSocket = false;
      neonConfig.pipelineConnect = false;
    }
    const pool = new NeonPool({ connectionString: url, max });
    pool.on("error", logIdleError);
    return {
      db: drizzleNeon({ client: pool }) as unknown as Db,
      driver,
      close: () => pool.end(),
    };
  }
  const pool = new pg.Pool({ connectionString: url, max });
  pool.on("error", logIdleError);
  return {
    db: drizzlePg({ client: pool }) as unknown as Db,
    driver,
    close: () => pool.end(),
  };
}

/** One connection per process (survives dev hot reloads), as in Ralli Wolf. */
const g = globalThis as unknown as { __himsDatabase?: Connection };

/** The app's connection to DATABASE_URL. */
export function database(): Db {
  if (!g.__himsDatabase) {
    const url = serverEnv().DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    g.__himsDatabase = connect(url);
  }
  return g.__himsDatabase.db;
}

/** Closes the app's connection (CLI scripts and tests, before exiting). */
export async function closeDatabase() {
  const current = g.__himsDatabase;
  g.__himsDatabase = undefined;
  await current?.close();
}
