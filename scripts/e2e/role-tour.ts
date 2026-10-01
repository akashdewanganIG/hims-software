// Every seeded role, every page, through the real UI: pages a role may open
// render without errors; the others show "No access". In server mode the
// API is probed directly too — a forbidden view must answer 403, whatever
// the UI. Access is data (the roles table), so in server mode the expected
// modules are read from the app's own sign-in directory; a browser-mode run
// starts from a fresh hospital, whose roles are the defaults.
//
// Needs the app running (npm run dev) and a local Chrome or Edge.
//   npm run e2e:roles     (E2E_BASE_URL, E2E_BROWSER, E2E_SHOTS to override)
import { chromium, type Page } from "playwright-core";

import { DEFAULT_ROLES, MODULE_LABEL, type Module } from "../../lib/rbac";
import { SYSTEM_ROLES, type SystemRole } from "../../lib/sim/schema";
import type { DirectoryRole } from "../../lib/views/system";
import { BASE, OUT, signInAs } from "./lib.mjs";

const PAGES: Array<[string, Module]> = [
  ["/", "dashboard"],
  ["/enquiries", "enquiry"],
  ["/opd", "opd"],
  ["/opd/appointments", "opd"],
  ["/ipd", "ipd"],
  ["/patients", "ehr"],
  ["/pharmacy", "pharmacy"],
  ["/pharmacy/inventory", "pharmacy"],
  ["/pharmacy/transactions", "pharmacy"],
  ["/lab", "lab"],
  ["/beds", "beds"],
  ["/operations", "operations"],
  ["/wfm", "wfm"],
  ["/wfm/roster", "wfm"],
  ["/billing", "billing"],
  ["/mrd", "mrd"],
  ["/complaints", "complaints"],
  ["/feedback", "feedback"],
  ["/analytics", "analytics"],
  ["/admin/users", "admin"],
  ["/architecture", "dashboard"],
];

/** A view per module, to probe the API's own access control. */
const PROBES: Array<[Module, string, object]> = [
  ["billing", "billing.summary", {}],
  ["lab", "lab.worklist", { stage: "all" }],
  ["mrd", "mrd.summary", {}],
  ["wfm", "wfm.staff", {}],
  ["analytics", "analytics.overview", { days: 7 }],
  ["pharmacy", "pharmacy.inventory", {}],
  ["complaints", "complaints.summary", {}],
  ["admin", "admin.users", {}],
];

const browser = await chromium.launch({
  channel:
    process.env.E2E_BROWSER ??
    (process.platform === "win32" ? "msedge" : "chrome"),
  headless: true,
});
const failures: string[] = [];
const config = (await (await fetch(`${BASE}/api/config`)).json()) as {
  mode: string;
};
console.log(`• ${BASE} runs in ${config.mode} mode\n`);

/** Each role's name and modules, as the running app has them. */
async function rolesOf(): Promise<
  Map<string, { name: string; modules: string[] }>
> {
  if (config.mode === "server") {
    const response = await fetch(
      `${BASE}/api/views/session.directory?params=${encodeURIComponent("{}")}`
    );
    const body = (await response.json()) as {
      data?: DirectoryRole[];
      error?: { message?: string };
    };
    if (!response.ok || !body.data)
      throw new Error(
        `The sign-in directory is unavailable: ${body.error?.message ?? response.status}`
      );
    return new Map(body.data.map(r => [r.id, r]));
  }
  return new Map(
    Object.entries(DEFAULT_ROLES).map(([id, r]) => [
      id,
      { name: r.name, modules: r.modules },
    ])
  );
}
const roles = await rolesOf();

async function settle(page: Page) {
  await page
    .waitForLoadState("networkidle", { timeout: 20_000 })
    .catch(() => null);
  await page
    .locator('[data-slot="skeleton"], .animate-pulse')
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => null);
}

for (const roleId of SYSTEM_ROLES as readonly SystemRole[]) {
  const role = roles.get(roleId);
  if (!role) {
    failures.push(`${roleId} is not offered on the sign-in screen`);
    continue;
  }
  const opens = new Set(role.modules);
  const canAccess = (module: Module) => opens.has(module);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", m => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => {
    if (r.url().includes("/api/") && r.status() >= 500)
      errors.push(`${r.status()} ${r.url()}`);
  });

  await signInAs(page, role.name);

  let opened = 0;
  let locked = 0;
  for (const [path, module] of PAGES) {
    await page.goto(`${BASE}${path}`);
    await settle(page);
    const noAccess = await page
      .getByText(`No access to ${MODULE_LABEL[module]}`)
      .count();
    const broken = await page.getByText("Could not load this view").count();
    const allowed = canAccess(module);
    if (allowed && noAccess) failures.push(`${role.name} was refused ${path}`);
    if (!allowed && !noAccess)
      failures.push(`${role.name} opened ${path} without access`);
    if (broken) {
      failures.push(`${role.name} saw a load error on ${path}`);
      await page.screenshot({
        path: `${OUT}/roles_${roleId.toLowerCase()}_${path.replace(/\W+/g, "_")}.png`,
      });
    }
    if (allowed) opened += 1;
    else locked += 1;
  }

  // Page-phase errors only: the probes below log their expected 403s.
  const pageErrors = [...errors];
  if (config.mode === "server") {
    for (const [module, view, params] of PROBES) {
      const status = await page.evaluate(
        async ([v, p]) =>
          (
            await fetch(
              `/api/views/${v}?params=${encodeURIComponent(JSON.stringify(p))}`
            )
          ).status,
        [view, params] as const
      );
      const expected = canAccess(module) ? 200 : 403;
      if (status !== expected)
        failures.push(
          `${role.name}: API ${view} answered ${status}, expected ${expected}`
        );
    }
  }

  const noise = pageErrors.filter(
    e => !/favicon|Download the React DevTools/.test(e)
  );
  if (noise.length)
    failures.push(
      `${role.name}: console errors — ${noise.slice(0, 3).join(" | ")}`
    );
  console.log(
    `• ${role.name.padEnd(19)} ${opened} pages open, ${locked} locked${noise.length ? `, ${noise.length} console error(s)` : ""}`
  );
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(
    `\n✗ ${failures.length} problem(s):\n  ${failures.join("\n  ")}`
  );
  process.exit(1);
}
console.log(
  "\n✓ Every role sees exactly the pages its access allows, and every page loads."
);
