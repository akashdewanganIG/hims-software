// Sends an acknowledgement-required alert to one named nurse through the
// browser UI, proves that nurse receives and acknowledges it, proves another
// nurse does not receive it, then checks the sender's persisted targeting and
// acknowledgement audit. Works in browser and PostgreSQL data modes.
import { BASE, confirmAction, launch } from "./lib.mjs";

async function choose(page, field, option) {
  await field.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const { page, step, toast, login, finish } = await launch("alerts");
const subject = `Targeted nurse acknowledgement ${Date.now().toString(36)}`;
let targetNurse = "";
let otherNurse = "";

await login("Administrator");

await step("send to one nurse", async () => {
  await page.goto(`${BASE}/alerts`);
  await page.getByRole("button", { name: "Send alert" }).click();
  const dialog = page.getByRole("dialog", { name: "Send an alert" });
  await choose(
    page,
    dialog.getByRole("combobox", { name: "Send to" }),
    "One person in a staff role"
  );
  await choose(
    page,
    dialog.getByRole("combobox", { name: "Staff role" }),
    "Nurse"
  );

  const person = dialog.getByRole("combobox", { name: "Person in this role" });
  await person.click();
  const options = page.getByRole("option");
  targetNurse = (await options.nth(1).innerText()).trim();
  otherNurse = (await options.nth(2).innerText()).trim();
  await options.nth(1).click();

  await dialog.getByLabel("Priority").click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await dialog.getByLabel("Require acknowledgement").check();
  await dialog.getByLabel("What is this about?").fill(subject);
  await dialog
    .getByLabel("Complete details")
    .fill(
      "Please acknowledge this targeted browser-test alert after reviewing the evening handover instructions."
    );
  await dialog.getByRole("button", { name: "Send alert" }).click();
  await toast("Alert sent to 1 recipient");
});

await step("target nurse acknowledges", async () => {
  await login("Nurse", targetNurse);
  await page.goto(`${BASE}/alerts`);
  const row = page.locator("tbody tr", { hasText: subject });
  await row.waitFor({ timeout: 30_000 });
  await row.click();
  await page.getByText("Your acknowledgement is required").waitFor();
  await page.getByRole("button", { name: "Acknowledge alert" }).click();
  await confirmAction(page, "Acknowledge this alert?", "Acknowledge");
  await toast("Alert acknowledged");
  await page.getByText("Acknowledged", { exact: true }).last().waitFor();
});

await step("other nurse is excluded", async () => {
  await login("Nurse", otherNurse);
  await page.goto(`${BASE}/alerts`);
  await page
    .getByPlaceholder("Subject, details, sender or category")
    .fill(subject);
  await page.waitForTimeout(1_000);
  if (await page.getByText(subject, { exact: true }).count())
    throw new Error("The individual alert leaked into another nurse's inbox");
});

await step("sender sees targeting audit", async () => {
  await login("Administrator");
  await page.goto(`${BASE}/alerts`);
  const sentTab = page.getByRole("tab", { name: /^Sent/ });
  await sentTab.click();
  await page
    .getByPlaceholder("Subject, details, sender or category")
    .fill(subject);
  const row = page.locator("tbody tr", { hasText: subject });
  await row.waitFor({ timeout: 30_000 });
  if (!(await row.innerText()).includes(`Staff member: ${targetNurse}`))
    throw new Error("The sender cannot see the original individual target");
  await row.click();
  const details = page.getByRole("dialog", { name: subject });
  await details
    .getByText(`Staff member: ${targetNurse}`, { exact: true })
    .waitFor();
  await details.getByText("1 of 1", { exact: true }).waitFor();
});

await finish();
