// End-to-end OPD journey through the real UI: register a new patient at the
// walk-in desk → vitals → consultation with prescription and labs → visit
// closure (prescription downloaded) → dispensing → lab verification → payment → results in the EHR →
// integrity check. Works in both data modes.
//
// Needs the app running (npm run dev) and a local Chrome or Edge.
//   npm run e2e:opd        (screenshots go to $E2E_SHOTS, default ./.e2e)
import {
  BASE,
  expectPdf,
  launch,
  registerThroughPicker,
  uniquePerson,
} from "./lib.mjs";

const { page, step, toast, login, finish } = await launch("opd");
await login("Administrator");

let patientName = "";
await step("walk-in with new registration", async () => {
  await page.goto(`${BASE}/opd`);
  await page.getByRole("button", { name: "Walk-in" }).click();
  const dialog = page.getByRole("dialog", { name: "Walk-in patient" });
  patientName = await registerThroughPicker(page, dialog, {
    ...uniquePerson("Ishaan"),
    gender: "MALE",
  });
  await dialog.getByText(patientName).first().waitFor();
  await dialog.getByRole("combobox", { name: "Doctor" }).click();
  await page
    .getByRole("option", { name: /General Medicine/ })
    .first()
    .click();
  await dialog
    .getByPlaceholder("e.g. Cough and fever since 2 days")
    .fill("High fever and body ache since 2 days");
  await dialog.getByRole("button", { name: "Check in" }).click();
  await toast("Checked in — token");
  console.log(`(patient ${patientName})`);
});

await step("open visit", async () => {
  await page.getByRole("tab", { name: /^Waiting/ }).click();
  await page.locator("tbody tr", { hasText: patientName }).first().click();
  await page.waitForURL(/\/opd\/visits\//, { timeout: 15_000 });
  await page.getByRole("button", { name: /Record vitals/ }).waitFor();
});
const visitUrl = page.url();

await step("vitals", async () => {
  await page.getByRole("button", { name: /Record vitals/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Temperature (°C)").fill("38.9");
  await dialog.getByLabel("Pulse (/min)").fill("104");
  await dialog.getByLabel("SpO₂ (%)").fill("97");
  await dialog.getByRole("button", { name: "Save vitals" }).click();
  await toast("Vitals recorded");
});

await step("consultation", async () => {
  await page.getByRole("button", { name: "Start consultation" }).click();
  await toast("Consultation started");
  await page.getByRole("button", { name: "Add diagnosis" }).click();
  await page
    .getByLabel("Diagnosis", { exact: true })
    .last()
    .fill("Acute febrile illness");
  await page.getByLabel("ICD-10 code").last().fill("R50.9");
});

await step("prescribe", async () => {
  await page.getByRole("button", { name: "Prescribe" }).click();
  await page
    .getByRole("combobox")
    .filter({ hasText: "Search formulary" })
    .first()
    .click();
  await page.getByPlaceholder("Name, generic or class").fill("Dolo");
  await page.getByRole("option", { name: /Dolo/ }).first().click();
  await page.getByRole("button", { name: "Send to pharmacy" }).click();
  await toast("sent to pharmacy");
});

await step("order labs", async () => {
  await page.getByRole("button", { name: "Order tests" }).first().click();
  await page.getByRole("checkbox", { name: "Complete Blood Count" }).click();
  await page.getByRole("checkbox", { name: "Dengue NS1 Antigen" }).click();
  await page.getByRole("button", { name: "Order tests" }).last().click();
  await toast("sent to the laboratory");
});

await step("close visit", async () => {
  await page.getByRole("button", { name: "Close visit" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close visit" })
    .click();
  await toast("case sheet filed to MRD");
  const file = await expectPdf(
    page,
    page.getByRole("button", { name: "Download Rx" })
  );
  console.log(`(${file})`);
});

await step("dispense", async () => {
  await page.goto(`${BASE}/pharmacy`);
  const row = page.locator("tbody tr", { hasText: patientName }).first();
  await row.getByRole("button", { name: "Dispense" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Dispense", exact: true }).click();
  await toast("stock and bill updated");
});

await step("lab to verified", async () => {
  await page.goto(`${BASE}/lab`);
  await page.locator("tbody tr", { hasText: patientName }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Collect sample" }).click();
  await toast("collected");
  await sheet.getByRole("button", { name: "Start processing" }).click();
  await toast("Processing started");
  // The result form appears once the order shows as in processing.
  await sheet.getByRole("button", { name: "Save results" }).waitFor();
  for (const input of await sheet.locator("input[inputmode=decimal]").all())
    await input.fill("5");
  for (const select of await sheet.getByRole("combobox").all()) {
    await select.click();
    await page.getByRole("option", { name: "Positive" }).click();
  }
  await sheet.getByRole("button", { name: "Save results" }).click();
  await toast("awaiting verification");
  await sheet.getByRole("button", { name: /Verify/ }).click();
  await toast("released to the patient record");
});

await step("collect payment", async () => {
  await page.goto(`${BASE}/billing`);
  await page
    .getByPlaceholder("Bill no., patient, UHID or phone")
    .fill(patientName);
  await page.locator("tbody tr", { hasText: patientName }).first().click();
  await page.waitForURL(/\/billing\/inv_/, { timeout: 15_000 });
  await page.getByRole("button", { name: /^Collect/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Collect/ })
    .click();
  await toast("received");
});

await step("patient record shows results", async () => {
  await page.goto(visitUrl);
  await page.getByRole("link", { name: patientName }).first().click();
  await page.waitForURL(/\/patients\//, { timeout: 15_000 });
  await page.getByRole("tab", { name: /Lab results/ }).click();
  await page.getByText("NS1 antigen").first().waitFor();
});

await step("integrity check", async () => {
  await page.getByRole("button", { name: "Simulation status" }).click();
  await page.getByRole("button", { name: "Run check" }).click();
  await page
    .getByText(/All cross-module rules hold/)
    .first()
    .waitFor({ timeout: 30_000 });
});

await finish();
