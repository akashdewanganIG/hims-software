// Shared plumbing for the end-to-end journeys: a headless local Chrome/Edge,
// sign-in by role, named steps with screenshots, and registering a fresh
// patient through the UI so every run works on its own records — also when
// the data lives in a persistent PostgreSQL database.
import { mkdirSync, readFileSync } from "node:fs";

import { chromium } from "playwright-core";

export const OUT = process.env.E2E_SHOTS ?? ".e2e";
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3002";
mkdirSync(OUT, { recursive: true });

/**
 * Signs in through the sign-in screen: the role from the dropdown, then its
 * suggested login (preselected) with "Sign in as …".
 */
export async function signInAs(page, roleName) {
  // A cold dev server compiles the page on first request.
  await page.goto(`${BASE}/login`, { timeout: 180_000 });
  const role = page.getByRole("combobox", { name: "Role" });
  await role.waitFor({ timeout: 180_000 });
  await role.click();
  await page
    .getByRole("option", { name: new RegExp(`^${roleName}(?![A-Za-z])`) })
    .click();
  await page.getByRole("button", { name: /^Sign in as/ }).click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"), {
    timeout: 60_000,
  });
}

export async function launch(prefix) {
  const browser = await chromium.launch({
    channel:
      process.env.E2E_BROWSER ??
      (process.platform === "win32" ? "msedge" : "chrome"),
    headless: true,
  });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors = [];
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", e => errors.push(e.message));
  const mode = await fetch(`${BASE}/api/config`)
    .then(r => r.json())
    .then(c => c.mode)
    .catch(() => "browser");
  console.log(`• ${BASE} (${mode} mode)`);

  const step = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${OUT}/${prefix}_${name.replace(/\W+/g, "_").toLowerCase()}.png`,
    });
    console.log("ok");
  };
  const toast = text =>
    page.getByText(text).first().waitFor({ timeout: 15_000 });
  const login = role => signInAs(page, role);
  const finish = async () => {
    const noise = errors.filter(e => !/favicon/.test(e));
    console.log(
      noise.length
        ? `console errors:\n${noise.slice(0, 20).join("\n")}`
        : "no console errors"
    );
    await browser.close();
    if (noise.length) process.exitCode = 1;
  };
  return { browser, page, step, toast, login, finish, mode };
}

/** Clicks a download button and checks a real PDF arrives. */
export async function expectPdf(page, button) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    button.click(),
  ]);
  const file = await download.path();
  const head = readFileSync(file).subarray(0, 5).toString("latin1");
  if (head !== "%PDF-")
    throw new Error(`${download.suggestedFilename()} is not a PDF`);
  return download.suggestedFilename();
}

/** A name nobody else has, so the run finds only its own records. */
export function uniquePerson(first) {
  const tag = Date.now()
    .toString(36)
    .slice(-5)
    .replace(/\d/g, d => "abcdefghij"[d]);
  return { first, last: `Tester${tag.charAt(0).toUpperCase()}${tag.slice(1)}` };
}

/**
 * Opens the patient picker's "Register a new patient" from inside `dialog`,
 * fills the registration form and returns the registered name.
 */
export async function registerThroughPicker(page, dialog, person) {
  const name = `${person.first} ${person.last}`;
  await dialog.getByPlaceholder("Search by name, UHID or mobile").fill(name);
  await page.getByRole("button", { name: "Register a new patient" }).click();
  const form = page.getByRole("dialog", { name: "Register patient" });
  await form.getByLabel("Gender").click();
  await page
    .getByRole("option", {
      name: person.gender === "MALE" ? "Male" : "Female",
      exact: true,
    })
    .click();
  await form
    .getByLabel("Date of birth")
    .fill(person.dateOfBirth ?? "1986-03-14");
  await form
    .getByLabel("Mobile")
    .first()
    .fill(`97${String(Date.now()).slice(-8)}`);
  await form.getByLabel("Address").fill("14 Test Lane, Aundh");
  await form.getByLabel(/^Name/).fill("Kin Contact");
  await form.getByLabel("Mobile").last().fill("9811111111");
  if (person.allergies)
    await form.getByLabel("Allergies").fill(person.allergies);
  await form.getByRole("button", { name: "Register patient" }).click();
  await page
    .getByText(/^Registered /)
    .first()
    .waitFor({ timeout: 15_000 });
  await form.waitFor({ state: "detached", timeout: 15_000 });
  return name;
}
