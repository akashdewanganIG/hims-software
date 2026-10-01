/**
 * Migrations: the SQL files drizzle-kit wrote into ./drizzle (listed in its
 * journal) against what a database has applied (drizzle.__drizzle_migrations).
 * `npm run db:migrate` applies them; the health route, `npm run db:verify`
 * and `npm run doctor` report the difference.
 */
import { sql, type SQL } from "drizzle-orm";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import journal from "../../../drizzle/meta/_journal.json";
import type { Connection, Db } from "./client";

export const MIGRATIONS_FOLDER = "drizzle";

/** Rows of a raw query, whichever driver ran it. */
export async function queryRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

export interface MigrationStatus {
  /** Migrations in ./drizzle. */
  total: number;
  /** Migrations the database has recorded as applied. */
  applied: number;
  /** Tags on disk the database has not applied yet. */
  pending: string[];
  /** The newest applied migration's tag. */
  latest: string | null;
  /** The database was built by the Prisma version of this app. */
  legacy: boolean;
}

export async function migrationStatus(db: Db): Promise<MigrationStatus> {
  const [tables] = await queryRows<{
    drizzle: string | null;
    prisma: string | null;
  }>(
    db,
    sql`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS drizzle,
               to_regclass('public._prisma_migrations')::text AS prisma`
  );
  const applied = tables?.drizzle
    ? await queryRows<{ created_at: string | number }>(
        db,
        sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`
      )
    : [];
  const last = applied.length
    ? Number(applied[applied.length - 1]!.created_at)
    : -Infinity;
  const entries = journal.entries;
  return {
    total: entries.length,
    applied: applied.length,
    pending: entries.filter(e => e.when > last).map(e => e.tag),
    latest: [...entries].reverse().find(e => e.when <= last)?.tag ?? null,
    legacy: Boolean(tables?.prisma) && !tables?.drizzle,
  };
}

/** Applies every pending migration in one transaction. */
export async function runMigrations({ db, driver }: Connection) {
  const config = { migrationsFolder: MIGRATIONS_FOLDER };
  if (driver === "neon")
    await migrateNeon(db as unknown as NeonDatabase, config);
  else await migratePg(db as unknown as NodePgDatabase, config);
}
