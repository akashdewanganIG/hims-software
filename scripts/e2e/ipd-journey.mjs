// End-to-end IPD journey through the real UI: register and admit a new
// patient (only suitable beds are offered) → progress note → bed transfer →
// discharge summary → billing clearance (discharge is locked until then) →
// discharge (summary downloaded) → both vacated beds sent for cleaning → the running bill became
// a final bill → role access. Works in both modes.
//
// Needs the app running (npm run dev) and a local Chrome or Edge.
//   npm run e2e:ipd
import {
  BASE,
  expectPdf,
  launch,
  registerThroughPicker,
  uniquePerson,
} from "./lib.mjs";

const { page, step, toast, login, finish } = await launch("ipd");
await login("Administrator");

let patientName = "";
let bedCode = "";
await step("register and admit", async () => {
  await page.goto(`${BASE}/ipd`);
  await page.getByRole("button", { name: "Admit patient" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Admit patient" });
  patientName = await registerThroughPicker(page, dialog, {
    ...uniquePerson("Vikram"),
    gender: "MALE",
  });
  await dialog.getByText(patientName).first().waitFor();
  await dialog.getByRole("combobox", { name: "Admitting doctor" }).click();
  await page
    .getByRole("option", { name: /General Medicine/ })
    .first()
    .click();
  await dialog.getByRole("combobox", { name: "Bed" }).click();
  // Only beds whose ward suits this patient are listed.
  const bed = page.getByRole("option").nth(1);
  bedCode = (await bed.innerText()).split(" · ")[1]?.trim() ?? "";
  await bed.click();
  await dialog
    .getByLabel("Reason for admission")
    .fill("Fever with breathlessness");
  await dialog
    .getByLabel("Provisional diagnosis")
    .fill("Community-acquired pneumonia");
  await dialog.getByRole("button", { name: "Admit", exact: true }).click();
  await page.waitForURL(/\/ipd\/adm_/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Add note" }).waitFor();
  console.log(`(${patientName} → bed ${bedCode})`);
});

await step("progress note", async () => {
  await page.getByRole("button", { name: "Add note" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByPlaceholder("Findings, response to treatment and plan")
    .fill(
      "Day 0: Febrile, SpO2 93% on air. Started IV antibiotics and oxygen."
    );
  await dialog.getByRole("button", { name: "Add note" }).click();
  await toast("Note added");
});

let targetBed = "";
await step("transfer", async () => {
  await page.getByRole("button", { name: "Transfer" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Move to bed" }).click();
  const option = page.getByRole("option").nth(1);
  targetBed = (await option.innerText()).trim();
  await option.click();
  await dialog.getByLabel("Reason").fill("Upgrade requested by family");
  await dialog.getByRole("button", { name: "Request transfer" }).click();
  await toast("Transfer requested");
  await page.getByRole("button", { name: "Complete move" }).click();
  await toast("Transfer completed");
  console.log(`(→ ${targetBed})`);
});

await step("discharge summary", async () => {
  await page.getByRole("button", { name: "Initiate discharge" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Initiate discharge" })
    .click();
  await toast("Discharge initiated");
  await page
    .getByLabel("Course in hospital")
    .fill("Treated with IV antibiotics and oxygen; afebrile from day 2.");
  await page
    .getByLabel("Condition at discharge")
    .fill("Stable, afebrile, ambulant");
  await page
    .getByLabel("Follow-up instructions")
    .fill("Review in General Medicine OPD in one week.");
  await page.getByRole("button", { name: "Finalise summary" }).click();
  await toast("Discharge summary finalised");
});

await step("billing clearance", async () => {
  // The ward cannot discharge until the billing desk clears it.
  if (await page.getByRole("button", { name: "Discharge patient" }).count())
    throw new Error("Discharge offered before billing clearance");
  await page.getByRole("button", { name: "Clear billing" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Clear billing for discharge",
  });
  await dialog
    .getByLabel(/Approved by/)
    .fill("Cashless claim approved by the insurer");
  await dialog.getByRole("button", { name: "Clear with dues" }).click();
  await toast("Billing cleared");
});

await step("discharge", async () => {
  await page.getByRole("button", { name: "Discharge patient" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discharge" })
    .click();
  await toast("bed released for cleaning");
  const file = await expectPdf(
    page,
    page.getByRole("button", { name: "Download summary" })
  );
  console.log(`(${file})`);
  await page.getByRole("tab", { name: "Billing" }).click();
});

await step("beds released for cleaning", async () => {
  await page.goto(`${BASE}/beds`);
  const status = async code =>
    page
      .getByRole("button", { name: new RegExp(`^Bed ${code},`) })
      .first()
      .getAttribute("aria-label");
  const secondCode = targetBed.split(" · ")[1];
  const [first, second] = [await status(bedCode), await status(secondCode)];
  console.log(`(${first} | ${second})`);
  if (!/Cleaning/.test(first ?? "") || !/Cleaning/.test(second ?? ""))
    throw new Error("Vacated beds should be in cleaning");
});

await step("final bill issued", async () => {
  await page.goto(`${BASE}/billing`);
  await page
    .getByPlaceholder("Bill no., patient, UHID or phone")
    .fill(patientName);
  await page.getByRole("tab", { name: /^All/ }).click();
  await page.locator("tbody tr", { hasText: patientName }).first().click();
  await page.waitForURL(/\/billing\/inv_/, { timeout: 15_000 });
  await page
    .getByText(/Pending|Paid|Partially paid/)
    .first()
    .waitFor();
});

await step("role access", async () => {
  await login("Pharmacist");
  await page.goto(`${BASE}/ipd`);
  await page.getByText("No access to IPD").waitFor({ timeout: 15_000 });
});

await finish();
