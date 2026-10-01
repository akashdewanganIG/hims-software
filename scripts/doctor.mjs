// Checks that this machine can run the HIMS app, and says how to fix what
// is missing.   npm run doctor
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";

const results = [];
const check = (ok, label, hint) => results.push({ ok, label, hint });
const warn = (label, hint) => results.push({ ok: null, label, hint });

const env = { ...process.env };
const hasEnvFile = existsSync(".env");
if (hasEnvFile) {
  try {
    process.loadEnvFile(".env");
    Object.assign(env, process.env);
  } catch (error) {
    check(false, ".env could not be read", String(error));
  }
}

// Node and dependencies.
const [major, minor] = process.versions.node.split(".").map(Number);
check(
  major > 20 || (major === 20 && minor >= 9),
  `Node.js ${process.versions.node}`,
  "Install Node.js 20.9 or newer (22 LTS recommended)."
);
check(
  existsSync("node_modules/next"),
  "dependencies installed",
  "Run npm install."
);
check(
  existsSync("node_modules/drizzle-orm") &&
    existsSync("node_modules/pg") &&
    existsSync("node_modules/@neondatabase/serverless"),
  "database drivers installed (Drizzle ORM, node-postgres, Neon)",
  "Run npm install."
);
check(
  existsSync("drizzle/meta/_journal.json"),
  "migrations present (./drizzle)",
  "Restore the drizzle folder from git — it holds the database migrations."
);

// Data mode.
const url = env.DATABASE_URL?.trim();
const mode = url ? "server" : "browser";
if (!hasEnvFile)
  warn(
    "no .env file — browser mode (each browser keeps its own hospital)",
    "For the shared PostgreSQL database: cp .env.example .env && npm run db:setup"
  );
check(
  true,
  `data mode: ${mode}${mode === "server" ? " (PostgreSQL is the system of record)" : ""}`
);

async function reachable(host, port) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port, timeout: 2500 });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function inspectDatabase(connectionString) {
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const {
      rows: [tables],
    } = await client.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS drizzle, to_regclass('public._prisma_migrations')::text AS prisma"
    );
    if (tables.prisma && !tables.drizzle) {
      check(
        false,
        "database built by the Prisma version of this app",
        "Rebuild it with Drizzle migrations: npm run db:reset (guarded — see .env.example)."
      );
      return;
    }
    const applied = tables.drizzle
      ? (
          await client.query(
            "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
          )
        ).rows
      : [];
    const journal = JSON.parse(
      readFileSync("drizzle/meta/_journal.json", "utf8")
    );
    const last = applied.length
      ? Number(applied[applied.length - 1].created_at)
      : -Infinity;
    const pending = journal.entries.filter(e => e.when > last);
    check(
      pending.length === 0,
      pending.length
        ? `${pending.length} migration(s) not applied`
        : `database schema up to date (${applied.length} migration(s))`,
      "Apply migrations: npm run db:migrate."
    );
    if (pending.length) return;
    const {
      rows: [sync],
    } = await client.query(
      "SELECT version, to_char(anchored_at, 'YYYY-MM-DD') AS day FROM sync_state WHERE id = 1"
    );
    if (sync)
      check(
        true,
        `hospital seeded (data version ${sync.version}, anchored ${sync.day})`
      );
    else
      warn(
        "database not seeded yet",
        "Run npm run db:seed, or just open the app — it seeds on first use."
      );
  } catch (error) {
    check(
      false,
      "could not read the database",
      error?.code === "3D000"
        ? "The database does not exist: npm run db:up, then npm run db:migrate."
        : String(error).split("\n")[0]
    );
  } finally {
    await client.end().catch(() => {});
  }
}

if (mode === "server") {
  let target = null;
  try {
    target = new URL(url ?? "");
    check(
      ["postgres:", "postgresql:"].includes(target.protocol),
      "DATABASE_URL is a PostgreSQL URL",
      "Use postgresql://user:password@host:port/database (on Neon: the pooled connection string)."
    );
  } catch {
    check(false, "DATABASE_URL is set and valid", "Copy it from .env.example.");
  }
  if (!env.DIRECT_URL)
    warn(
      "DIRECT_URL not set — migrations use DATABASE_URL",
      "On Neon set DIRECT_URL to the direct (non-pooled) connection string; locally it can equal DATABASE_URL."
    );

  if (target) {
    const neonHost = target.hostname.endsWith(".neon.tech");
    const driver = neonHost ? "neon" : "pg";
    check(
      true,
      `driver: ${driver === "neon" ? "Neon serverless (WebSockets)" : "node-postgres (TCP)"}${neonHost ? " · Neon" : ""}`
    );
    const port = Number(target.port || 5432);
    const up = await reachable(target.hostname, port);
    check(
      up,
      `PostgreSQL reachable at ${target.hostname}:${port}`,
      neonHost
        ? "Check the Neon project is not deleted and this network allows outbound 5432."
        : "Start it: npm run db:up (Docker, or your installed PostgreSQL)."
    );
    if (up) await inspectDatabase(env.DIRECT_URL || url);
  }
  if (env.NODE_ENV === "production")
    check(
      (env.SESSION_SECRET ?? "").length >= 32,
      "SESSION_SECRET set (32+ characters)",
      "Required in production; see .env.example for a generator."
    );
  else if (!env.SESSION_SECRET)
    warn(
      "SESSION_SECRET not set — a development secret is used",
      "Set one before deploying."
    );
}

// End-to-end tests need a local Chromium browser.
const browsers = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app",
];
const browser = browsers.find(b => existsSync(b));
if (browser) check(true, `browser for e2e tests: ${browser.split("/").pop()}`);
else
  warn(
    "no Chrome/Edge found for the e2e journeys",
    "Install Chrome or set E2E_BROWSER."
  );

console.log("\nHIMS doctor\n");
for (const r of results) {
  const mark = r.ok === null ? "!" : r.ok ? "✓" : "✗";
  console.log(`  ${mark} ${r.label}`);
  if (r.ok !== true && r.hint) console.log(`      → ${r.hint}`);
}
const failed = results.filter(r => r.ok === false).length;
console.log(
  failed
    ? `\n✗ ${failed} problem(s) to fix.\n`
    : "\n✓ Ready. npm run dev → http://localhost:3002\n"
);
process.exit(failed ? 1 : 0);
