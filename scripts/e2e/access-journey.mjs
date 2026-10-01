// End-to-end journey through the access and parity features: an
// Administrator creates a role and a login in User management → that login
// signs in on the new role and is refused what the role lacks → the login is
// disabled and disappears from the sign-in screen → a pharmacist makes a
// counter (OTC) sale → the billing desk sees it in the day-end collection →
// the token display, the architecture map (cut to a nurse's access) and the
// printable prescription and lab report render. Works in both data modes
// (the prints need server mode to look records up).
//
// Needs the app running (npm run dev) and a local Chrome or Edge.
//   npm run e2e:access
import { BASE, launch } from "./lib.mjs";

/** Opens a SelectField (a Radix combobox) and picks an option. */
async function choose(page, field, option) {
  await field.click();
  await (
    typeof option === "string"
      ? page.getByRole("option", { name: option, exact: true })
      : option(page)
  ).click();
}

const { page, step, toast, login, finish, mode } = await launch("access");
const roleName = `Desk Supervisor ${Date.now().toString(36).slice(-4)}`;
let username = "";

await login("Administrator");

await step("create a role", async () => {
  await page.goto(`${BASE}/admin/users`);
  await page.getByRole("button", { name: "New role" }).click();
  const dialog = page.getByRole("dialog", { name: "New role" });
  await dialog.getByLabel("Name").fill(roleName);
  await dialog
    .getByLabel("Description")
    .fill("Front-desk supervisor for the e2e run.");
  await dialog.getByLabel("Check patients in and issue tokens").check();
  await dialog.getByLabel("Log complaints", { exact: true }).check();
  // Ticking an action opened its module; land on the OPD queue.
  await choose(
    page,
    dialog.getByRole("combobox", { name: "Lands on" }),
    "OPD queue"
  );
  await dialog.getByRole("button", { name: "Create role" }).click();
  await toast(`${roleName} created`);
  await page.getByRole("tab", { name: /^Roles & permissions/ }).click();
  await page.getByText(roleName).first().waitFor();
});

await step("create a login on it", async () => {
  await page.getByRole("tab", { name: /^Users/ }).click();
  await page.getByRole("button", { name: "New login" }).click();
  const dialog = page.getByRole("dialog", { name: "New login" });
  await choose(
    page,
    dialog.getByRole("combobox", { name: "Staff member" }),
    p => p.getByRole("option").nth(1)
  );
  await choose(page, dialog.getByRole("combobox", { name: "Role" }), roleName);
  username = await dialog.getByLabel("Login ID").inputValue();
  if (!username) throw new Error("No login ID suggested");
  await dialog.getByRole("button", { name: "Create login" }).click();
  await toast(`Login ${username} created`);
  await page.keyboard.press("Escape");
  console.log(`(${username} → ${roleName})`);
});

await step("sign in on the new role", async () => {
  await login(roleName);
  await page.waitForURL(url => url.pathname === "/opd", { timeout: 60_000 });
  await page.goto(`${BASE}/billing`);
  await page.getByText("No access to Billing").waitFor({ timeout: 15_000 });
  await page.goto(`${BASE}/admin/users`);
  await page
    .getByText("No access to Administration")
    .waitFor({ timeout: 15_000 });
});

await step("disable the login", async () => {
  await login("Administrator");
  await page.goto(`${BASE}/admin/users`);
  await page
    .getByPlaceholder("Name, login ID, email or staff ID")
    .fill(username);
  await page.locator("tbody tr", { hasText: username }).first().click();
  const dialog = page.getByRole("dialog").last();
  await choose(
    page,
    dialog.getByRole("combobox", { name: "Status" }),
    "Disabled"
  );
  await dialog.getByRole("button", { name: "Save login" }).click();
  await toast(`${username} saved`);
  await page.goto(`${BASE}/login`);
  await page.getByRole("combobox", { name: "Role" }).click();
  const option = page.getByRole("option", {
    name: new RegExp(`^${roleName}`),
  });
  await option.waitFor();
  if (!/no active logins/.test(await option.innerText()))
    throw new Error("A disabled login is still offered on the sign-in screen");
  await page.keyboard.press("Escape");
});

await step("counter sale", async () => {
  await login("Pharmacist");
  await page.goto(`${BASE}/pharmacy`);
  await page.getByRole("button", { name: "Counter sale" }).click();
  const dialog = page.getByRole("dialog", { name: "Counter sale" });
  await dialog.getByPlaceholder("Search by name, UHID or mobile").fill("ar");
  await page.getByRole("option").first().click();
  // The first enabled medicine after the placeholder: OTC and in stock.
  await choose(page, dialog.getByRole("combobox", { name: "Medicine" }), p =>
    p.getByRole("option", { disabled: false }).nth(1)
  );
  await dialog.getByRole("button", { name: /^Sell/ }).click();
  await toast("Counter sale INV-");
});

await step("day-end collection", async () => {
  await login("Billing Executive");
  await page.goto(`${BASE}/billing/collections`);
  await page.getByRole("heading", { name: "Day-end collection" }).waitFor();
  await page.getByText("Pharmacy counter").first().waitFor({ timeout: 15_000 });
});

await step("token display", async () => {
  await login("Administrator");
  await page.goto(`${BASE}/opd/display`);
  await page.getByText("OPD token display").waitFor({ timeout: 30_000 });
});

await step("architecture map for a nurse", async () => {
  await login("Nurse");
  await page.goto(`${BASE}/architecture`);
  await page.getByRole("heading", { name: "Architecture & flows" }).waitFor();
  if (await page.getByText("User management", { exact: true }).count())
    throw new Error("A nurse should not see User management on the map");
  await page.getByRole("tab", { name: /^Workflows/ }).click();
  await page
    .getByRole("navigation", { name: "Workflows" })
    .getByText("IPD: admission to discharge")
    .click();
  await page.getByText("You", { exact: true }).first().waitFor();
});

if (mode === "server") {
  await step("printable prescription and lab report", async () => {
    await login("Administrator");
    const found = await page.evaluate(async () => {
      const view = async (name, params) =>
        (
          await (
            await fetch(
              `/api/views/${name}?params=${encodeURIComponent(JSON.stringify(params))}`
            )
          ).json()
        ).data;
      const lab = await view("lab.worklist", { stage: "all" });
      const verified = lab.find(o => o.status === "VERIFIED");
      const day = offset =>
        new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const visits = await view("opd.appointments", {
        from: day(-7),
        to: day(0),
        status: "COMPLETED",
      });
      const visit = visits.find(a => a.encounterId);
      return {
        labId: verified?.id ?? null,
        encounterId: visit?.encounterId ?? null,
      };
    });
    if (found.encounterId) {
      await page.goto(`${BASE}/opd/visits/${found.encounterId}/print`);
      await page.getByText("℞").waitFor({ timeout: 30_000 });
    }
    if (found.labId) {
      await page.goto(`${BASE}/lab/reports/${found.labId}`);
      await page
        .getByText("Laboratory report", { exact: true })
        .waitFor({ timeout: 30_000 });
    }
    if (!found.encounterId || !found.labId)
      throw new Error("No closed visit or verified lab order to print");
  });
}

await finish();
