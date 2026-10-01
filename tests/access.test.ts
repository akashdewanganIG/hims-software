/**
 * Role-based access, enforced where the data is (not only in the UI):
 * every operation × every role, every view × every role, sign-in rules, and
 * the consistency of the permission tables themselves.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { OperationError, prepareOperation } from "../lib/ops/execute";
import { OPERATIONS, OPERATION_NAMES } from "../lib/ops/registry";
import {
  ACTIONS,
  ACTION_MODULE,
  DEFAULT_ROLES,
  LANDING_PAGES,
  MODULES,
  can,
  canAccess,
  normaliseGrants,
  resolveAccess,
  type Action,
  type Module,
} from "../lib/rbac";
import { SYSTEM_ROLES, type SystemRole } from "../lib/sim/schema";
import { prepareView } from "../lib/views/execute";
import { VIEWS, VIEW_NAMES } from "../lib/views/registry";
import { loginDirectoryView, sessionView } from "../lib/views/system";
import { Hospital } from "./helpers";

const h = new Hospital();
const users = Object.fromEntries(
  SYSTEM_ROLES.map(role => [role, h.login(role)])
) as Record<SystemRole, string>;
/** A seeded role's access, as its logins (without custom access) get it. */
const accessOf = (role: SystemRole) =>
  resolveAccess(h.db.roles.find(r => r.id === role));

function codeOf(fn: () => unknown) {
  try {
    fn();
    return "OK";
  } catch (error) {
    return error instanceof OperationError ? error.code : "THROWN";
  }
}

test("each operation is allowed for exactly the roles holding one of its actions", () => {
  for (const name of OPERATION_NAMES) {
    const def = OPERATIONS[name];
    for (const role of SYSTEM_ROLES) {
      const allowed =
        def.allow.length === 0 ||
        def.allow.some(a => can(accessOf(role), a as Action));
      // Authorisation runs before validation, so an empty input shows the
      // decision: FORBIDDEN when refused, INVALID_INPUT (or OK) when allowed.
      const code = codeOf(() => prepareOperation(h.db, users[role], name, {}));
      if (allowed)
        assert.notEqual(code, "FORBIDDEN", `${role} should be allowed ${name}`);
      else assert.equal(code, "FORBIDDEN", `${role} must not ${name}`);
    }
  }
});

test("operations need a signed-in, active user and valid input", () => {
  assert.equal(
    codeOf(() => prepareOperation(h.db, null, "patient.register", {})),
    "UNAUTHENTICATED"
  );
  assert.equal(
    codeOf(() => prepareOperation(h.db, "usr_nobody", "patient.register", {})),
    "UNAUTHENTICATED"
  );
  assert.equal(
    codeOf(() => prepareOperation(h.db, users.ADMINISTRATOR, "no.such.op", {})),
    "UNKNOWN_OPERATION"
  );
  assert.equal(
    codeOf(() =>
      prepareOperation(h.db, users.ADMINISTRATOR, "appointment.checkIn", {
        appointmentId: 42,
      })
    ),
    "INVALID_INPUT"
  );
  // Unknown keys are stripped: a client cannot smuggle internal flags.
  const prepared = prepareOperation(
    h.db,
    users.RECEPTIONIST,
    "appointment.book",
    {
      patientId: "p",
      doctorId: "d",
      scheduledAt: new Date().toISOString(),
      type: "NEW",
      source: "PHONE",
      reason: "x",
      allowOverbook: true,
    }
  );
  assert.equal("allowOverbook" in (prepared.input as object), false);

  const clone = new Hospital();
  const nurse = clone.login("NURSE");
  clone.staffOf(nurse).status = "INACTIVE";
  assert.equal(
    codeOf(() => prepareOperation(clone.db, nurse, "opd.recordVitals", {})),
    "FORBIDDEN"
  );
});

test("each view is readable by exactly the roles with one of its modules", () => {
  for (const name of VIEW_NAMES) {
    const def = VIEWS[name] as { modules: readonly Module[]; public?: boolean };
    for (const role of SYSTEM_ROLES) {
      const allowed =
        def.public ||
        def.modules.length === 0 ||
        def.modules.some(m => canAccess(accessOf(role), m));
      const code = codeOf(() => prepareView(h.db, users[role], name, {}));
      if (allowed)
        assert.notEqual(code, "FORBIDDEN", `${role} should read ${name}`);
      else assert.equal(code, "FORBIDDEN", `${role} must not read ${name}`);
    }
    if (!def.public)
      assert.equal(
        codeOf(() => prepareView(h.db, null, name, {})),
        "UNAUTHENTICATED",
        `${name} requires sign-in`
      );
  }
});

test("permission tables are consistent", () => {
  const used = new Set(
    OPERATION_NAMES.flatMap(n => [...OPERATIONS[n].allow] as Action[])
  );
  for (const name of OPERATION_NAMES)
    for (const action of OPERATIONS[name].allow)
      assert.ok(ACTIONS.includes(action as Action), `${name}: ${action}`);
  // simulation.reset is enforced by the reset endpoint, not an operation.
  const unused = ACTIONS.filter(a => !used.has(a) && a !== "simulation.reset");
  assert.deepEqual(
    unused,
    [],
    `actions no operation uses: ${unused.join(", ")}`
  );
  for (const name of VIEW_NAMES)
    for (const viewModule of VIEWS[name].modules)
      assert.ok(MODULES.includes(viewModule), `${name}: ${viewModule}`);
  // Every action belongs to a module; every default role is stored in its
  // canonical form, opens its landing page and can do something.
  for (const action of ACTIONS)
    assert.ok(MODULES.includes(ACTION_MODULE[action]), action);
  for (const role of SYSTEM_ROLES) {
    const def = DEFAULT_ROLES[role];
    assert.deepEqual(
      normaliseGrants(def.modules, def.actions),
      { modules: def.modules, actions: def.actions },
      `${role} is stored normalised`
    );
    const landing = LANDING_PAGES.find(p => p.path === def.homePath);
    assert.ok(landing && def.modules.includes(landing.module), role);
    assert.ok(canAccess(accessOf(role), "dashboard"), role);
    assert.ok(def.actions.length > 0, role);
  }
});

test("access follows the login: custom access, custom roles, disabled logins", () => {
  const clone = new Hospital();
  const pharmacists = clone.db.users.filter(u => u.roleId === "PHARMACIST");
  const counter = pharmacists.find(u => u.customAccess)!;
  const plain = pharmacists.find(
    u => !u.customAccess && u.status === "ACTIVE"
  )!;
  assert.ok(counter && plain, "seed has both kinds of pharmacist");
  const collect = { invoiceId: "x", amount: 1, method: "CASH" };
  assert.notEqual(
    codeOf(() =>
      prepareOperation(clone.db, counter.id, "billing.collect", collect)
    ),
    "FORBIDDEN",
    "custom access adds payment collection"
  );
  assert.equal(
    codeOf(() =>
      prepareOperation(clone.db, plain.id, "billing.collect", collect)
    ),
    "FORBIDDEN",
    "the role alone does not"
  );

  const inCharge = clone.db.users.find(
    u => clone.db.roles.find(r => r.id === u.roleId)?.name === "Ward In-charge"
  )!;
  assert.ok(inCharge, "seed has a custom role in use");
  assert.notEqual(
    codeOf(() => prepareOperation(clone.db, inCharge.id, "wfm.setRoster", {})),
    "FORBIDDEN",
    "the custom role grants roster management"
  );
  assert.equal(
    codeOf(() => prepareOperation(clone.db, inCharge.id, "billing.refund", {})),
    "FORBIDDEN"
  );

  const disabled = clone.db.users.find(u => u.status === "DISABLED")!;
  assert.ok(disabled, "seed has a disabled login");
  assert.equal(
    codeOf(() =>
      prepareOperation(clone.db, disabled.id, "patient.register", {})
    ),
    "UNAUTHENTICATED"
  );
  assert.equal(sessionView(clone.db, disabled.id), null);
  assert.ok(
    !loginDirectoryView(clone.db).some(r =>
      r.users.some(u => u.userId === disabled.id)
    ),
    "disabled logins are not offered on the sign-in screen"
  );

  // A permission removed from a role is refused at once.
  const nurse = clone.login("NURSE");
  assert.notEqual(
    codeOf(() => prepareOperation(clone.db, nurse, "opd.recordVitals", {})),
    "FORBIDDEN"
  );
  const role = clone.db.roles.find(r => r.id === "NURSE")!;
  role.actions = role.actions.filter(a => a !== "opd.vitals");
  assert.equal(
    codeOf(() => prepareOperation(clone.db, nurse, "opd.recordVitals", {})),
    "FORBIDDEN"
  );
  // The session carries the resolved access for the client.
  const session = sessionView(clone.db, nurse)!;
  assert.ok(!session.access.actions.includes("opd.vitals"));
  assert.equal(session.role.name, "Nurse");
});

/** Page → module, from the navigation rules. */
function moduleForRoute(file: string): Module | null {
  const route =
    file
      .replace(/\\/g, "/")
      .replace(/^app/, "")
      .replace(/\/page\.tsx$/, "") || "/";
  const map: Array<[string, Module]> = [
    ["/enquiries", "enquiry"],
    ["/opd", "opd"],
    ["/ipd", "ipd"],
    ["/patients", "ehr"],
    ["/pharmacy", "pharmacy"],
    ["/lab", "lab"],
    ["/beds", "beds"],
    ["/operations", "operations"],
    ["/wfm", "wfm"],
    ["/billing", "billing"],
    ["/mrd", "mrd"],
    ["/complaints", "complaints"],
    ["/feedback", "feedback"],
    ["/analytics", "analytics"],
    ["/admin", "admin"],
    ["/architecture", "dashboard"],
  ];
  if (route === "/") return "dashboard";
  if (route === "/login") return null;
  return (
    map.find(([p]) => route === p || route.startsWith(`${p}/`))?.[1] ?? null
  );
}

test("every view a page reads is open to every role that can open the page", () => {
  const root = process.cwd();
  const read = (file: string) => readFileSync(join(root, file), "utf8");

  // Hook name → view name, from the feature hook modules.
  const hookToView = new Map<string, string>();
  for (const feature of readdirSync(join(root, "features"))) {
    let api = "";
    try {
      api = read(join("features", feature, "api.ts"));
    } catch {
      continue;
    }
    for (const m of api.matchAll(
      /export function (use\w+)\([^)]*\)[^{]*\{\s*return useView\(\s*"([\w.]+)"/g
    ))
      hookToView.set(m[1]!, m[2]!);
  }
  assert.ok(hookToView.size >= 40, `found ${hookToView.size} view hooks`);

  const viewsIn = (source: string) => {
    const names = new Set<string>();
    for (const [hook, view] of hookToView)
      if (new RegExp(String.raw`\b${hook}\(`).test(source)) names.add(view);
    for (const m of source.matchAll(/useView\(\s*"([\w.]+)"/g))
      names.add(m[1]!);
    return names;
  };

  // Views reachable from a file through its imports of app components.
  const memo = new Map<string, Set<string>>();
  const reach = (file: string, trail = new Set<string>()): Set<string> => {
    const cached = memo.get(file);
    if (cached) return cached;
    // Hook modules define hooks; call sites are matched by hook name above.
    if (trail.has(file) || /^features\/\w+\/api$/.test(file)) return new Set();
    trail.add(file);
    let source = "";
    for (const candidate of [file, `${file}.tsx`, `${file}.ts`]) {
      try {
        source = read(candidate);
        break;
      } catch {
        // try the next extension
      }
    }
    const names = viewsIn(source);
    for (const m of source.matchAll(
      /from "@\/((?:features|components)\/[\w/.-]+)"/g
    ))
      for (const n of reach(m[1]!, trail)) names.add(n);
    memo.set(file, names);
    return names;
  };

  const shell = reach("components/layout/app-shell");
  const pages = readdirSync(join(root, "app"), { recursive: true })
    .map(f => join("app", String(f)).split("\\").join("/"))
    .filter(f => f.endsWith("page.tsx"));
  let checked = 0;
  for (const page of pages) {
    const pageModule = moduleForRoute(page);
    if (!pageModule) continue;
    const reached = new Set([...reach(page), ...shell]);
    for (const role of SYSTEM_ROLES) {
      const access = accessOf(role);
      if (!canAccess(access, pageModule)) continue;
      for (const view of reached) {
        const def = VIEWS[view as keyof typeof VIEWS];
        assert.ok(def, `${page} reads unknown view ${view}`);
        const open =
          def.modules.length === 0 ||
          def.modules.some(m => canAccess(access, m));
        assert.ok(open, `${role} can open ${page} but not read ${view}`);
        checked += 1;
      }
    }
  }
  assert.ok(
    checked > 200,
    `only ${checked} page/role/view combinations checked`
  );
});
