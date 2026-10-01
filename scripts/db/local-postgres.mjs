// Runs the project's PostgreSQL for local development.
//
//   npm run db:up       start (Docker if available, else a project-local
//                       cluster in ./.pgdata built with your installed
//                       PostgreSQL binaries) and create the database
//   npm run db:down     stop it
//   npm run db:status   show what is running
//
// The server listens where DATABASE_URL points (default localhost:5433, the
// same port as docker-compose.yml), with the user and password from that URL,
// so one .env works for both. An existing PostgreSQL on 5432 is never touched.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  // No .env: fall back to the defaults below (same as .env.example).
}

const url = new URL(
  process.env.DIRECT_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@localhost:5433/hims_simulation?schema=public"
);
const host = url.hostname;
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username || "postgres");
const password = decodeURIComponent(url.password || "password");
const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
const dataDir = join(root, ".pgdata");
const command = process.argv[2] ?? "status";
const isWindows = process.platform === "win32";

function run(bin, args, options = {}) {
  return spawnSync(bin, args, {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    ...options,
  });
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  fail(
    `DATABASE_URL points at ${host}. db:up only manages a local database; use your hosting provider's tools for remote ones.`
  );
}

/* ------------------------------ Docker ------------------------------ */

function dockerAvailable() {
  const probe = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return probe.status === 0;
}

function docker(args) {
  const result = run("docker", ["compose", ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) fail(`docker compose ${args.join(" ")} failed.`);
}

/* ------------------------ Installed binaries ------------------------ */

function findBinDir() {
  const exe = name => (isWindows ? `${name}.exe` : name);
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);
  const onPath = run(isWindows ? "where" : "which", ["pg_ctl"]);
  if (onPath.status === 0) {
    const first = onPath.stdout.split(/\r?\n/).find(Boolean);
    if (first) candidates.push(resolve(first, ".."));
  }
  const versioned = (base, suffix = "bin") => {
    if (!existsSync(base)) return;
    for (const version of readdirSync(base)
      .filter(v => /^\d+(\.\d+)?$/.test(v))
      .sort((a, b) => Number(b) - Number(a)))
      candidates.push(join(base, version, suffix));
  };
  if (isWindows) {
    versioned("C:\\Program Files\\PostgreSQL");
  } else {
    versioned("/usr/lib/postgresql");
    versioned("/Applications/Postgres.app/Contents/Versions");
    for (const brew of ["/opt/homebrew/opt", "/usr/local/opt"]) {
      if (!existsSync(brew)) continue;
      for (const dir of readdirSync(brew).filter(d =>
        d.startsWith("postgresql")
      ))
        candidates.push(join(brew, dir, "bin"));
    }
  }
  return candidates.find(
    dir =>
      existsSync(join(dir, exe("pg_ctl"))) &&
      existsSync(join(dir, exe("initdb")))
  );
}

function tool(binDir, name) {
  return join(binDir, isWindows ? `${name}.exe` : name);
}

function clusterRunning(binDir) {
  if (!existsSync(join(dataDir, "PG_VERSION"))) return false;
  return run(tool(binDir, "pg_ctl"), ["-D", dataDir, "status"]).status === 0;
}

function initCluster(binDir) {
  console.log(
    `• Creating a local PostgreSQL cluster in .pgdata (user ${user})`
  );
  const tmp = mkdtempSync(join(tmpdir(), "hims-pg-"));
  const pwfile = join(tmp, "pw");
  writeFileSync(pwfile, `${password}\n`);
  const result = run(
    tool(binDir, "initdb"),
    [
      "-D",
      dataDir,
      "-U",
      user,
      "--pwfile",
      pwfile,
      "--auth=scram-sha-256",
      "-E",
      "UTF8",
      "--no-locale",
    ],
    { stdio: "pipe" }
  );
  rmSync(tmp, { recursive: true, force: true });
  if (result.status !== 0)
    fail(`initdb failed:\n${result.stderr || result.stdout}`);
}

function startCluster(binDir) {
  if (!existsSync(join(dataDir, "PG_VERSION"))) initCluster(binDir);
  if (clusterRunning(binDir)) {
    console.log(`• Local PostgreSQL already running on port ${port}`);
    return;
  }
  console.log(`• Starting local PostgreSQL on localhost:${port}`);
  const result = run(
    tool(binDir, "pg_ctl"),
    [
      "-D",
      dataDir,
      "-l",
      join(dataDir, "server.log"),
      "-o",
      `-p ${port} -c listen_addresses=localhost`,
      "-w",
      "-t",
      "60",
      "start",
    ],
    // The server outlives this script: it must not hold our stdout/stderr
    // open, or whatever is reading them (a terminal pipe, CI) never finishes.
    { stdio: "ignore" }
  );
  if (result.status !== 0)
    fail(
      `pg_ctl start failed — see .pgdata/server.log (is port ${port} in use?)`
    );
}

function ensureDatabase(binDir) {
  if (!database) return;
  const psql = tool(binDir, "psql");
  if (!existsSync(psql)) return; // npm run db:migrate creates it instead
  const exists = run(psql, [
    "-h",
    "localhost",
    "-p",
    String(port),
    "-U",
    user,
    "-d",
    "postgres",
    "-tAc",
    `SELECT 1 FROM pg_database WHERE datname = '${database.replace(/'/g, "''")}'`,
  ]);
  if (exists.stdout.trim() === "1") return;
  const created = run(tool(binDir, "createdb"), [
    "-h",
    "localhost",
    "-p",
    String(port),
    "-U",
    user,
    database,
  ]);
  if (created.status !== 0) fail(`createdb failed:\n${created.stderr}`);
  console.log(`• Created database ${database}`);
}

/* ------------------------------- main ------------------------------- */

const binDir = findBinDir();
// Docker (docker-compose.yml, as in Ralli Wolf) when it is running; the
// installed binaries otherwise. HIMS_DB_USE_LOCAL=1 forces the local cluster.
const useDocker =
  process.env.HIMS_DB_USE_LOCAL === "1" && binDir ? false : dockerAvailable();

if (command === "up") {
  if (useDocker) {
    docker(["up", "-d", "--wait"]);
  } else if (binDir) {
    startCluster(binDir);
    ensureDatabase(binDir);
  } else {
    fail(
      "Neither Docker nor PostgreSQL binaries were found. Install Docker Desktop (then `docker compose up -d`) or PostgreSQL 15+ (or set PG_BIN to its bin folder)."
    );
  }
  console.log(
    `\n✓ PostgreSQL ready at localhost:${port}/${database}\n  Next: npm run db:migrate && npm run db:seed\n`
  );
} else if (command === "down") {
  if (useDocker) docker(["down"]);
  else if (binDir && clusterRunning(binDir)) {
    const result = run(
      tool(binDir, "pg_ctl"),
      ["-D", dataDir, "-m", "fast", "stop"],
      { stdio: "inherit" }
    );
    if (result.status !== 0) fail("pg_ctl stop failed.");
  } else console.log("• Local PostgreSQL is not running.");
} else if (command === "status") {
  if (useDocker) docker(["ps"]);
  else if (binDir) {
    console.log(
      clusterRunning(binDir)
        ? `• Local PostgreSQL (.pgdata) running on port ${port} — binaries in ${binDir}`
        : `• Local PostgreSQL (.pgdata) is not running — binaries in ${binDir}`
    );
  } else console.log("• No Docker and no PostgreSQL binaries found.");
} else {
  fail(`Unknown command "${command}". Use up, down or status.`);
}
