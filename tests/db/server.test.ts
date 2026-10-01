/**
 * PostgreSQL-backed server: seeding, round trip, atomic commits with an
 * operation log, refusals, catching up with other server processes, a
 * failed commit rolling back, reset, day re-anchoring, and the HTTP routes.
 *
 * Needs DATABASE_URL. Runs against a separate `<database>_test` database,
 * rebuilt from the migrations on every run, so it never touches your data.
 *   npm run test:db         (node-postgres, as for local and CI databases)
 *   npm run test:db:neon    (Neon's serverless driver, via a local proxy)
 */
process.env.TZ = "Asia/Kolkata";

import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { after, before, describe, test } from "node:test";

import { and, count, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import pg from "pg";

import type { Db } from "../../lib/server/db/client";
import * as schema from "../../lib/server/db/schema";

import { toOperationError } from "../../lib/ops/execute";
import { toPayload } from "../../lib/sim/changes";
import { checkIntegrity } from "../../lib/sim/integrity";
import { transactTracked } from "../../lib/sim/journal";
import type { Database, TableName } from "../../lib/sim/schema";
import { isoDate } from "../../lib/sim/time";
import { fingerprint, json, newPatient } from "../helpers";

try {
  process.loadEnvFile(".env");
} catch {
  // CI passes DATABASE_URL directly.
}
const base = process.env.DATABASE_URL;

function testUrl(url: string) {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!name.endsWith("_test")) parsed.pathname = `/${name}_test`;
  return parsed.toString();
}

describe(
  "PostgreSQL server",
  { skip: base ? false : "DATABASE_URL is not set" },
  () => {
    const url = testUrl(base ?? "postgresql://localhost/none");
    let engine: typeof import("../../lib/server/engine");
    let persistence: typeof import("../../lib/server/persistence");
    let db: Db;
    let closeDatabase: () => Promise<void>;

    before(async () => {
      // Create the test database if needed.
      const admin = new pg.Client({ connectionString: base });
      await admin.connect();
      const dbName = decodeURIComponent(new URL(url).pathname.slice(1));
      const exists = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [dbName]
      );
      if (!exists.rowCount)
        await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
      await admin.end();

      process.env.DATABASE_URL = url;
      process.env.DIRECT_URL = url;
      const client = await import("../../lib/server/db/client");
      const migrations = await import("../../lib/server/db/migrations");

      // Rebuild it from the migrations, with the driver under test.
      const setup = client.connect(url, { max: 1 });
      await setup.db.execute(
        sql.raw(
          "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
        )
      );
      await migrations.runMigrations(setup);
      const status = await migrations.migrationStatus(setup.db);
      assert.deepEqual(status.pending, [], "every migration applied");
      await setup.close();

      engine = await import("../../lib/server/engine");
      persistence = await import("../../lib/server/persistence");
      db = client.database();
      closeDatabase = client.closeDatabase;
      // The database is empty: the engine must seed it itself.
      engine.forgetState();
    });

    after(async () => {
      await closeDatabase?.();
    });

    const countRows = async (table: typeof schema.changeLog) =>
      (await db.select({ n: count() }).from(table))[0]!.n;
    const loadFromDatabase = async (): Promise<Database> => {
      const meta = await persistence.readSyncMeta(db);
      return persistence.readTables(db, meta!);
    };
    const sameData = (a: Database, b: Database) => {
      for (const table of Object.keys(a) as Array<TableName | "meta">)
        assert.ok(
          isDeepStrictEqual(json(a[table]), json(b[table])),
          `${table} differs from PostgreSQL`
        );
    };
    const userOf = (db: Database, role: string) =>
      db.users.find(
        u =>
          u.roleId === role &&
          u.status === "ACTIVE" &&
          !u.customAccess &&
          db.staff.find(s => s.id === u.staffId)!.status === "ACTIVE"
      )!.id;

    test("seeds an empty database on first use, and the working copy equals PostgreSQL", async () => {
      const state = await engine.readState();
      assert.ok(state.db.patients.length > 100);
      assert.deepEqual(checkIntegrity(state.db), []);
      const counts = await persistence.countTables(db);
      for (const table of persistence.TABLES)
        assert.equal(counts[table], state.db[table].length, table);
      sameData(await loadFromDatabase(), state.db);
    });

    test("an operation commits its rows, a version and a log entry atomically", async () => {
      const state = await engine.readState();
      const desk = userOf(state.db, "RECEPTIONIST");
      const version = state.version;
      const outcome = await engine.runOperation(
        desk,
        "patient.register",
        newPatient({ firstName: "Dbtest" })
      );
      const patient = outcome.result as { id: string; uhid: string };
      assert.equal(outcome.version, version + 1);
      const [row] = await db
        .select()
        .from(schema.patients)
        .where(eq(schema.patients.id, patient.id));
      assert.equal(row?.uhid, patient.uhid);
      const [entry] = await db
        .select()
        .from(schema.changeLog)
        .where(eq(schema.changeLog.version, version + 1));
      assert.equal(entry?.operation, "patient.register");
      assert.equal(entry?.label, "Register patient");
      const meta = await persistence.readSyncMeta(db);
      assert.equal(meta!.version, version + 1);
      assert.deepEqual(
        meta!.counters,
        state.db.meta.counters,
        "counters persisted"
      );
      sameData(await loadFromDatabase(), (await engine.readState()).db);
    });

    test("refused and unauthorised operations change nothing", async () => {
      const state = await engine.readState();
      const before = { version: state.version, print: fingerprint(state.db) };
      const logBefore = await countRows(schema.changeLog);
      const nurse = userOf(state.db, "NURSE");
      const cases: Array<[string | null, string, unknown, string]> = [
        [null, "patient.register", newPatient(), "UNAUTHENTICATED"],
        [nurse, "patient.register", newPatient(), "FORBIDDEN"],
        [
          userOf(state.db, "RECEPTIONIST"),
          "patient.register",
          newPatient({ phone: "1" }),
          "RULE_VIOLATION",
        ],
        [
          userOf(state.db, "RECEPTIONIST"),
          "patient.register",
          { firstName: 1 },
          "INVALID_INPUT",
        ],
      ];
      for (const [user, name, input, code] of cases) {
        const error = await engine.runOperation(user, name, input).then(
          () => null,
          (e: unknown) => toOperationError(e)
        );
        assert.equal(
          error?.code,
          code,
          `${name} as ${user}: ${error?.message}`
        );
      }
      const after = await engine.readState();
      assert.equal(after.version, before.version);
      assert.equal(fingerprint(after.db), before.print);
      assert.equal(await countRows(schema.changeLog), logBefore);
    });

    test("commits by another server process are replayed before the next operation", async () => {
      const state = await engine.readState();
      const baseVersion = state.version;
      const desk = userOf(state.db, "RECEPTIONIST");
      // Simulate a second process: run an operation on its own copy and commit it.
      const other = structuredClone(state.db);
      const { prepareOperation } = await import("../../lib/ops/execute");
      const prepared = prepareOperation(
        other,
        desk,
        "patient.register",
        newPatient({ firstName: "Elsewhere" })
      );
      const tracked = transactTracked(other, draft =>
        prepared.run({
          db: draft,
          now: new Date(),
          actorId: prepared.actor.staff.id,
        })
      );
      const payload = toPayload(other, tracked.changes);
      await db.transaction(async tx => {
        const bumped = await tx
          .update(schema.syncState)
          .set({
            version: baseVersion + 1,
            userChanges: sql`${schema.syncState.userChanges} + 1`,
            counters: payload.meta!.counters,
          })
          .where(
            and(
              eq(schema.syncState.id, 1),
              eq(schema.syncState.version, baseVersion)
            )
          )
          .returning({ id: schema.syncState.id });
        assert.equal(bumped.length, 1);
        await persistence.applyChangeSet(tx, payload);
        await tx.insert(schema.changeLog).values({
          version: baseVersion + 1,
          epoch: state.epoch,
          operation: "patient.register",
          label: "Register patient",
          changes: payload,
        });
      });
      // Our engine is one version behind; its next operation catches up first.
      const outcome = await engine.runOperation(
        desk,
        "patient.register",
        newPatient({ firstName: "Here" })
      );
      assert.equal(outcome.version, baseVersion + 2);
      const now = await engine.readState();
      const names = new Set(now.db.patients.map(p => p.firstName));
      assert.ok(
        names.has("Elsewhere") && names.has("Here"),
        "both processes' patients present"
      );
      assert.deepEqual(checkIntegrity(now.db), []);
      sameData(await loadFromDatabase(), now.db);
    });

    test("a commit PostgreSQL rejects leaves the working copy untouched", async () => {
      const state = await engine.readState();
      const desk = userOf(state.db, "RECEPTIONIST");
      // Occupy the UHID the engine will issue next, out of band.
      const nextUhid = `HMS-${String(new Date().getFullYear()).slice(2)}-${String((state.db.meta.counters.uhid ?? 0) + 1).padStart(6, "0")}`;
      const template = state.db.patients[0]!;
      await db.insert(schema.patients).values(
        persistence.toRecord("patients", {
          ...template,
          id: "pat_rogue",
          uhid: nextUhid,
        } as never) as never
      );
      const before = { version: state.version, print: fingerprint(state.db) };
      const error = await engine
        .runOperation(desk, "patient.register", newPatient())
        .then(
          () => null,
          (e: unknown) => toOperationError(e)
        );
      assert.equal(error?.code, "UNAVAILABLE", error?.message);
      const after = await engine.readState();
      assert.equal(after.version, before.version);
      assert.equal(fingerprint(after.db), before.print);
      await db
        .delete(schema.patients)
        .where(eq(schema.patients.id, "pat_rogue"));
      const retry = await engine.runOperation(
        desk,
        "patient.register",
        newPatient()
      );
      assert.equal(retry.version, before.version + 1);
    });

    test("a restarted server loads exactly the committed state", async () => {
      const before = json((await engine.readState()).db);
      engine.forgetState();
      const reloaded = await engine.readState();
      sameData(before, reloaded.db);
    });

    describe("HTTP routes", () => {
      const origin = "http://localhost:3002";
      let cookie = "";
      const request = (
        path: string,
        init: {
          method?: string;
          body?: unknown;
          cookie?: string;
          origin?: string;
        } = {}
      ) => {
        const headers = new Headers({ host: "localhost:3002" });
        if (init.body !== undefined)
          headers.set("content-type", "application/json");
        if (init.cookie) headers.set("cookie", init.cookie);
        if (init.origin) headers.set("origin", init.origin);
        return new Request(`${origin}${path}`, {
          method: init.method ?? "GET",
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }) as unknown as NextRequest;
      };
      const params = (name: string) => ({ params: Promise.resolve({ name }) });
      const load = async <T>(path: string) => (await import(path)) as T;

      test("health reports the database", async () => {
        const { GET } = await load<typeof import("../../app/api/health/route")>(
          "../../app/api/health/route"
        );
        const response = await GET();
        const body = (await response.json()) as {
          status: string;
          database: {
            reachable: boolean;
            migrations: number;
            pendingMigrations: string[];
            driver: string;
          };
        };
        assert.equal(response.status, 200);
        assert.equal(body.status, "ok");
        assert.equal(body.database.reachable, true);
        assert.ok(body.database.migrations >= 1);
        assert.deepEqual(body.database.pendingMigrations, []);
        assert.equal(
          body.database.driver,
          process.env.NEON_WS_PROXY ||
            new URL(url).hostname.endsWith(".neon.tech")
            ? "neon"
            : "pg",
          "the driver under test answered"
        );
      });

      test("sign-in sets a signed, httpOnly session cookie", async () => {
        const { NextRequest } = await import("next/server");
        const { POST, GET } = await load<
          typeof import("../../app/api/session/route")
        >("../../app/api/session/route");
        const state = await engine.readState();
        const desk = userOf(state.db, "RECEPTIONIST");
        const wrap = (r: Request) => new NextRequest(r);
        const refused = await POST(
          wrap(
            request("/api/session", {
              method: "POST",
              body: { userId: "usr_nobody" },
            })
          )
        );
        assert.equal(refused.status, 401);
        const response = await POST(
          wrap(
            request("/api/session", {
              method: "POST",
              body: { userId: desk },
              origin,
            })
          )
        );
        assert.equal(response.status, 200);
        const setCookie = response.headers.get("set-cookie") ?? "";
        assert.match(setCookie, /hims_session=/);
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /SameSite=lax/i);
        cookie = setCookie.split(";")[0]!;
        const me = await GET(wrap(request("/api/session", { cookie })));
        const body = (await me.json()) as {
          session: { user: { id: string } } | null;
        };
        assert.equal(body.session?.user.id, desk);
        const forged = await GET(
          wrap(request("/api/session", { cookie: `${cookie}x` }))
        );
        assert.equal(
          ((await forged.json()) as { session: unknown }).session,
          null
        );
      });

      test("operations and views authorise the session's role", async () => {
        const { NextRequest } = await import("next/server");
        const wrap = (r: Request) => new NextRequest(r);
        const ops = await load<typeof import("../../app/api/ops/[name]/route")>(
          "../../app/api/ops/[name]/route"
        );
        const views = await load<
          typeof import("../../app/api/views/[name]/route")
        >("../../app/api/views/[name]/route");
        const input = { input: newPatient({ firstName: "Viahttp" }) };

        const anonymous = await ops.POST(
          wrap(
            request("/api/ops/patient.register", {
              method: "POST",
              body: input,
            })
          ),
          params("patient.register")
        );
        assert.equal(anonymous.status, 401);
        const crossSite = await ops.POST(
          wrap(
            request("/api/ops/patient.register", {
              method: "POST",
              body: input,
              cookie,
              origin: "https://evil.example",
            })
          ),
          params("patient.register")
        );
        assert.equal(crossSite.status, 403);
        const created = await ops.POST(
          wrap(
            request("/api/ops/patient.register", {
              method: "POST",
              body: input,
              cookie,
              origin,
            })
          ),
          params("patient.register")
        );
        assert.equal(created.status, 200, await created.clone().text());
        const outcome = (await created.json()) as {
          result: { uhid: string };
          version: number;
        };
        assert.match(outcome.result.uhid, /^HMS-/);

        const refused = await ops.POST(
          wrap(
            request("/api/ops/billing.refund", {
              method: "POST",
              body: {
                input: {
                  invoiceId: "x",
                  amount: 1,
                  method: "CASH",
                  reason: "x",
                },
              },
              cookie,
              origin,
            })
          ),
          params("billing.refund")
        );
        assert.equal(refused.status, 403, "receptionists cannot refund");
        const invalid = await ops.POST(
          wrap(
            request("/api/ops/appointment.checkIn", {
              method: "POST",
              body: { input: { appointmentId: 5 } },
              cookie,
              origin,
            })
          ),
          params("appointment.checkIn")
        );
        assert.equal(invalid.status, 400);
        const unknown = await ops.POST(
          wrap(
            request("/api/ops/nope", {
              method: "POST",
              body: {},
              cookie,
              origin,
            })
          ),
          params("nope")
        );
        assert.equal(unknown.status, 404);

        const search = await views.GET(
          wrap(
            request(
              `/api/views/patients.search?params=${encodeURIComponent(JSON.stringify({ query: "Viahttp" }))}`,
              { cookie }
            )
          ),
          params("patients.search")
        );
        assert.equal(search.status, 200);
        const hits = (await search.json()) as { data: Array<{ name: string }> };
        assert.ok(hits.data.some(p => p.name.startsWith("Viahttp")));
        const lab = await views.GET(
          wrap(
            request(
              "/api/views/lab.worklist?params=%7B%22stage%22%3A%22all%22%7D",
              { cookie }
            )
          ),
          params("lab.worklist")
        );
        assert.equal(lab.status, 403, "receptionists have no lab module");
      });

      test("only an administrator can reset", async () => {
        const { NextRequest } = await import("next/server");
        const wrap = (r: Request) => new NextRequest(r);
        const reset = await load<
          typeof import("../../app/api/admin/reset/route")
        >("../../app/api/admin/reset/route");
        const response = await reset.POST(
          wrap(
            request("/api/admin/reset", {
              method: "POST",
              body: {},
              cookie,
              origin,
            })
          )
        );
        assert.equal(response.status, 403);
      });
    });

    test("reset replaces the hospital under a new epoch", async () => {
      const before = await engine.readState();
      const epoch = before.epoch;
      const result = await engine.resetHospital();
      assert.notEqual(result.epoch, epoch);
      assert.equal(await countRows(schema.changeLog), 0);
      const meta = await persistence.readSyncMeta(db);
      assert.equal(meta!.userChanges, 0);
      assert.equal(meta!.epoch, result.epoch);
    });

    test("a new day re-anchors a changed hospital and replays an untouched one", async () => {
      const state = await engine.readState();
      const desk = userOf(state.db, "RECEPTIONIST");
      await engine.runOperation(
        desk,
        "patient.register",
        newPatient({ firstName: "Anchor" })
      );
      const appointment = (await engine.readState()).db.appointments.at(-1)!;
      // Pretend the data was last anchored yesterday.
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      await db
        .update(schema.syncState)
        .set({ anchoredAt: yesterday.toISOString() })
        .where(eq(schema.syncState.id, 1));
      engine.forgetState();
      const moved = await engine.readState();
      assert.equal(isoDate(moved.db.meta.anchoredAt), isoDate(new Date()));
      assert.ok(
        moved.db.patients.some(p => p.firstName === "Anchor"),
        "user changes survive"
      );
      const shifted = moved.db.appointments.find(a => a.id === appointment.id)!;
      assert.equal(
        new Date(shifted.scheduledAt).getTime() -
          new Date(appointment.scheduledAt).getTime(),
        24 * 3600 * 1000
      );
      sameData(await loadFromDatabase(), moved.db);

      await db
        .update(schema.syncState)
        .set({ anchoredAt: yesterday.toISOString(), userChanges: 0 })
        .where(eq(schema.syncState.id, 1));
      engine.forgetState();
      const fresh = await engine.readState();
      assert.ok(
        !fresh.db.patients.some(p => p.firstName === "Anchor"),
        "untouched data is replayed fresh"
      );
      assert.deepEqual(checkIntegrity(fresh.db), []);
    });
  }
);
