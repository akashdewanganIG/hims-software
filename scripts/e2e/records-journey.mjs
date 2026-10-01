// End-to-end journey through records, uploads and downloads: a patient is
// registered with a photo → a scanned document is uploaded, viewed, edited
// and removed → the photo is replaced and removed → the patient record
// downloads as a real PDF → a registration made in error is deleted → the
// operations manager edits their own staff record and adds a photo, which
// the header then shows → a complaint is corrected, a photo attached and
// removed, and the complaint downloaded → an MRD case file is downloaded →
// a charge keyed in by mistake is removed and the bill downloaded → a
// medicine is added to the formulary, edited and removed.
//
// Needs the app running (npm run dev) and a local Chrome or Edge.
//   npm run e2e:records
import { BASE, expectPdf, launch, uniquePerson } from "./lib.mjs";

/** A real 1×1 PNG, enough for the browser to decode and downscale. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const png = name => ({ name, mimeType: "image/png", buffer: PNG });

/** A minimal, valid one-page PDF, as a scanner would produce. */
function pdf(name) {
  const stream = "BT /F1 14 Tf 72 760 Td (Referral letter - e2e) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = text.length;
    text += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map(o => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join(
      ""
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(text, "latin1"),
  };
}

const fileInput = scope => scope.locator('input[type="file"]');

/** The first loaded row of a table (skeleton rows carry no text). */
const firstRow = page =>
  page.locator("tbody tr", { hasText: /[A-Za-z0-9]/ }).first();

const { page, step, toast, login, finish } = await launch("records");
const person = uniquePerson("Meera");
const name = `${person.first} ${person.last}`;

await login("Receptionist");

/** Registers a patient from the EHR list and lands on their record. */
async function register(someone, photo) {
  await page.goto(`${BASE}/patients`);
  await page.getByRole("button", { name: "Register patient" }).click();
  const form = page.getByRole("dialog", { name: "Register patient" });
  await form.getByLabel("First name").fill(someone.first);
  await form.getByLabel("Last name").fill(someone.last);
  await form.getByLabel("Date of birth").fill("1990-07-21");
  await form
    .getByLabel("Mobile")
    .first()
    .fill(`96${String(Date.now()).slice(-8)}`);
  await form.getByLabel("Address").fill("8 Records Lane, Aundh");
  await form.getByLabel(/^Name/).fill("Kin Contact");
  await form.getByLabel("Mobile").last().fill("9822222222");
  if (photo) {
    await fileInput(form).setInputFiles(png(photo));
    await form.getByText(photo.replace(/\.png$/, ".jpg")).waitFor();
  }
  await form.getByRole("button", { name: "Register patient" }).click();
  await toast(/^Registered /);
  await page.waitForURL(url => /^\/patients\/.+/.test(url.pathname));
}

await step("register with a photo", async () => {
  await register(person, "meera.png");
  await page.getByRole("img", { name: `Photo of ${name}` }).waitFor();
});

await step("upload, view and remove a document", async () => {
  await page.getByRole("button", { name: "Upload document" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload document" });
  await fileInput(dialog).setInputFiles(pdf("referral-letter.pdf"));
  await dialog.getByText("referral-letter.pdf").first().waitFor();
  await dialog.getByLabel("Title").fill("Referral letter from Dr Rao");
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await toast("Document uploaded to the patient record");
  await page.getByRole("tab", { name: /^Documents/ }).click();
  await page
    .getByRole("button", { name: "View Referral letter from Dr Rao" })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Referral letter from Dr Rao",
  });
  await preview.locator("iframe").waitFor({ timeout: 30_000 });
  await preview.getByRole("button", { name: "Close" }).first().click();
  await page
    .getByRole("button", { name: "Edit Referral letter from Dr Rao" })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit document" });
  await edit.getByLabel("Title").fill("Referral letter — Dr Rao");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await toast("Document updated");
  await page
    .getByRole("button", { name: "Remove Referral letter — Dr Rao" })
    .click();
  await page
    .getByRole("dialog", { name: "Remove document?" })
    .getByRole("button", { name: "Remove document" })
    .click();
  await toast("Document removed");
});

await step("replace and remove the photo", async () => {
  await page.getByRole("button", { name: "Change photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Photo" });
  await fileInput(dialog).setInputFiles(png("retaken.png"));
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await toast("Photo saved");
  await page.getByRole("button", { name: "Change photo" }).click();
  await dialog.getByRole("button", { name: "Remove photo" }).click();
  await page
    .getByRole("dialog", { name: "Remove photo?" })
    .getByRole("button", { name: "Remove photo" })
    .click();
  await toast("Photo removed");
  await page.getByRole("button", { name: "Add photo" }).waitFor();
});

await step("download the patient record", async () => {
  const file = await expectPdf(
    page,
    page.getByRole("button", { name: "Download record" })
  );
  console.log(`(${file})`);
});

await step("delete a registration made in error", async () => {
  await register(uniquePerson("Duplicate"));
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete this registration?" })
    .getByRole("button", { name: "Delete registration" })
    .click();
  await toast(/^Registration HMS-.* deleted$/);
  await page.waitForURL(url => url.pathname === "/patients");
});

await step("edit my staff record and add a photo", async () => {
  await login("Operations Manager");
  await page.getByRole("button", { name: /^Open account menu/ }).click();
  await page.getByRole("menuitem", { name: "My staff record" }).click();
  const sheet = page.getByRole("dialog").last();
  await sheet.getByRole("button", { name: "Edit details" }).click();
  const form = page.getByRole("dialog", { name: /^Edit / });
  const designation = form.getByLabel("Designation");
  const current = await designation.inputValue();
  await designation.fill(
    current.endsWith(" (senior)")
      ? current.slice(0, -" (senior)".length)
      : `${current} (senior)`
  );
  await form.getByRole("button", { name: "Save changes" }).click();
  await toast(/^Details updated for /);
  await form.waitFor({ state: "detached" });
  await sheet.getByRole("button", { name: /photo$/ }).click();
  const photo = page.getByRole("dialog", { name: "Photo" });
  await fileInput(photo).setInputFiles(png("staff.png"));
  await photo.getByRole("button", { name: "Save photo" }).click();
  await toast("Photo saved");
  // Close the sheet once the photo dialog has gone (Escape would only
  // dismiss a dialog still closing).
  await photo.waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });
  // The account menu now shows the photo instead of initials.
  await page
    .getByRole("button", { name: /^Open account menu/ })
    .locator("img")
    .waitFor();
});

await step("correct a complaint and attach a photo", async () => {
  await page.goto(`${BASE}/complaints`);
  await firstRow(page).click();
  const sheet = page.getByRole("dialog").last();
  await sheet.getByRole("button", { name: "Edit details" }).click();
  const form = page.getByRole("dialog", { name: /^Edit CMP-/ });
  const title = form.getByLabel("Title");
  await title.fill(`${await title.inputValue()} (corrected)`);
  await form.getByRole("button", { name: "Save changes" }).click();
  await toast(/^Complaint CMP-.* updated$/);
  await form.waitFor({ state: "detached" });
  await sheet.getByRole("button", { name: "Attach photo" }).click();
  const attach = page.getByRole("dialog", { name: "Attach photo" });
  await fileInput(attach).setInputFiles(png("evidence.png"));
  await attach.getByRole("button", { name: "Attach", exact: true }).click();
  await toast("Photo attached");
  await sheet.getByRole("button", { name: "View evidence.jpg" }).waitFor();
  await sheet.getByRole("button", { name: "Remove evidence.jpg" }).click();
  await page
    .getByRole("dialog", { name: "Remove photo?" })
    .getByRole("button", { name: "Remove photo" })
    .click();
  await toast("Photo removed");
  await page
    .getByRole("dialog", { name: "Remove photo?" })
    .waitFor({ state: "detached" });
  const file = await expectPdf(
    page,
    sheet.getByRole("button", { name: "Download PDF" })
  );
  console.log(`(${file})`);
  await page.keyboard.press("Escape");
});

await step("download a case file", async () => {
  await login("MRD Staff");
  await page.goto(`${BASE}/mrd`);
  await firstRow(page).click();
  const file = await expectPdf(
    page,
    page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "Download PDF" })
  );
  console.log(`(${file})`);
});

await step("remove a charge entered by mistake", async () => {
  await login("Billing Executive");
  // The list opens on bills with a balance due — still open to changes.
  await page.goto(`${BASE}/billing`);
  await firstRow(page).click();
  await page.waitForURL(url => /^\/billing\/.+/.test(url.pathname));
  await page.getByRole("button", { name: "Add charge" }).click();
  const dialog = page.getByRole("dialog", { name: "Add charge" });
  await dialog.getByLabel("Description").fill("Dressing (keyed twice)");
  await dialog.getByLabel(/^Unit price/).fill("250");
  await dialog.getByRole("button", { name: "Add charge" }).click();
  await dialog.waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Remove Dressing (keyed twice)" })
    .click();
  await page
    .getByRole("dialog", { name: "Remove charge?" })
    .getByRole("button", { name: "Remove charge" })
    .click();
  await toast("Charge removed");
  const file = await expectPdf(
    page,
    page.getByRole("button", { name: "Download PDF" })
  );
  console.log(`(${file})`);
});

await step("add, edit and remove a formulary item", async () => {
  await login("Pharmacist");
  await page.goto(`${BASE}/pharmacy/inventory`);
  await page.getByRole("button", { name: "Add medicine" }).click();
  const form = page.getByRole("dialog", { name: "Add medicine" });
  const brand = `E2Ecillin ${Date.now().toString(36).slice(-4)}`;
  await form.getByLabel("Brand name").fill(brand);
  await form.getByLabel("Generic name").fill("Amoxicillin");
  await form.getByLabel("Strength").fill("250 mg");
  await form.getByLabel("Dispensing unit").fill("capsule");
  await form.getByLabel("Category").fill("Antibiotic");
  await form.getByLabel("Manufacturer").fill("Test Pharma");
  await form.getByLabel(/^MRP per unit/).fill("6.5");
  await form.getByRole("button", { name: "Add medicine" }).click();
  await toast(new RegExp(`^${brand} 250 mg added as `));
  const sheet = page.getByRole("dialog", { name: `${brand} 250 mg` });
  await sheet.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: /^Edit / });
  await edit.getByLabel(/^MRP per unit/).fill("7");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await toast(`${brand} 250 mg updated`);
  await edit.waitFor({ state: "detached" });
  await sheet.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Remove from the formulary?" })
    .getByRole("button", { name: "Remove medicine" })
    .click();
  await toast(`${brand} 250 mg removed from the formulary`);
});

await finish();
