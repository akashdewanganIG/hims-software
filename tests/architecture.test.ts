/**
 * The Architecture & Flows map stays true to the application: every access
 * module appears exactly once, every route is a real page, every branch
 * leads to a step of its own flow, and each login sees only its modules.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  ARCH_AREAS,
  ARCH_MODULES,
  ARCH_RELATIONS,
  FLOW_CATEGORIES,
  USER_FLOWS,
} from "../lib/architecture";
import {
  ACTION_MODULE,
  DEFAULT_ROLES,
  MODULES,
  resolveAccess,
} from "../lib/rbac";
import { SYSTEM_ROLES } from "../lib/sim/schema";

const pageExists = (route: string) =>
  existsSync(
    join(process.cwd(), "app", ...route.split("/").filter(Boolean), "page.tsx")
  );

test("every module is mapped once, in a known area, with real pages", () => {
  assert.deepEqual(ARCH_MODULES.map(m => m.module).sort(), [...MODULES].sort());
  const areas = new Set(ARCH_AREAS.map(a => a.id));
  for (const m of ARCH_MODULES) {
    assert.ok(areas.has(m.area), `${m.module}: area ${m.area}`);
    assert.ok(m.pages.length > 0, `${m.module} has pages`);
    for (const page of m.pages)
      if (page.route)
        assert.ok(pageExists(page.route), `${m.module}: ${page.route}`);
  }
  for (const r of ARCH_RELATIONS) {
    assert.ok(MODULES.includes(r.from) && MODULES.includes(r.to), r.label);
    assert.notEqual(r.from, r.to, r.label);
  }
});

test("workflows reference real pages, modules, actions and steps", () => {
  const ids = new Set<string>();
  for (const flow of USER_FLOWS) {
    assert.ok(!ids.has(flow.id), `duplicate flow ${flow.id}`);
    ids.add(flow.id);
    assert.ok(FLOW_CATEGORIES.includes(flow.category), flow.id);
    const steps = new Set(flow.steps.map(s => s.id));
    assert.equal(steps.size, flow.steps.length, `${flow.id}: unique steps`);
    assert.equal(flow.steps[0]!.kind, "start", `${flow.id} starts`);
    assert.ok(
      flow.steps.some(s => s.kind === "end"),
      `${flow.id} has an end`
    );
    for (const step of flow.steps) {
      if (step.route && step.route !== "/login")
        assert.ok(
          pageExists(step.route),
          `${flow.id}/${step.id}: ${step.route}`
        );
      if (step.action && step.module)
        assert.equal(
          ACTION_MODULE[step.action],
          step.module,
          `${flow.id}/${step.id}: ${step.action} belongs to ${ACTION_MODULE[step.action]}`
        );
      if (step.kind === "decision")
        assert.ok((step.branches?.length ?? 0) >= 2, `${flow.id}/${step.id}`);
      for (const branch of step.branches ?? [])
        assert.ok(steps.has(branch.to), `${flow.id}/${step.id} → ${branch.to}`);
    }
  }
});

test("each default role sees a map cut to its own modules", () => {
  for (const role of SYSTEM_ROLES) {
    const access = resolveAccess({
      id: role,
      modules: DEFAULT_ROLES[role].modules,
      actions: DEFAULT_ROLES[role].actions,
    });
    const modules = ARCH_MODULES.filter(m => access.modules.has(m.module));
    const flows = USER_FLOWS.filter(f =>
      f.steps.some(s => s.module && access.modules.has(s.module))
    );
    assert.ok(modules.length >= 3, `${role}: ${modules.length} modules`);
    assert.ok(
      flows.some(f => f.id === "sign-in"),
      `${role} sees how sign-in works`
    );
    if (role === "ADMINISTRATOR") {
      assert.equal(modules.length, MODULES.length);
      assert.equal(flows.length, USER_FLOWS.length);
    } else {
      assert.ok(modules.length < MODULES.length, `${role} is cut down`);
      assert.ok(
        !flows.some(f => f.id === "access"),
        `${role} does not see access management`
      );
    }
  }
});
