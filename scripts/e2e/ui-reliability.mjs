// Shared overlay regression checks: portal-based selects and patient search
// must remain visible above scrollable dialogs on desktop and mobile.
//
// Needs the app running on E2E_BASE_URL (default http://localhost:3002).
//   npm run e2e:ui
import assert from "node:assert/strict";

import { BASE, launch } from "./lib.mjs";

const { page, step, login, finish } = await launch("ui-reliability");

async function assertTopLayer(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  const state = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(
      window.innerWidth - 1,
      Math.max(0, rect.left + rect.width / 2)
    );
    const y = Math.min(
      window.innerHeight - 1,
      Math.max(0, rect.top + Math.min(rect.height / 2, 28))
    );
    const top = document.elementFromPoint(x, y);
    return {
      insideViewport:
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight,
      topLayer: Boolean(top && (top === element || element.contains(top))),
      topElement: top
        ? `${top.tagName.toLowerCase()}${top.getAttribute("role") ? `[role=${top.getAttribute("role")}]` : ""}.${String(top.className).split(/\s+/).slice(0, 3).join(".")}`
        : null,
      bounds: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
      // Radix Select adds a positioning wrapper inside its body portal, while
      // PatientPicker is attached to body directly. Either must escape the
      // scrollable dialog subtree that originally clipped these controls.
      outsideDialog: element.closest('[role="dialog"]') === null,
      zIndex: Number.parseInt(getComputedStyle(element).zIndex || "0", 10),
    };
  });
  assert.equal(
    state.outsideDialog,
    true,
    `${label} must render outside its dialog`
  );
  assert.equal(
    state.insideViewport,
    true,
    `${label} must fit inside the viewport`
  );
  assert.equal(
    state.topLayer,
    true,
    `${label} layering: ${JSON.stringify(state)}`
  );
  assert.ok(state.zIndex >= 90, `${label} must be above modal content`);
}

await login("Administrator");

await step("select above patient dialog", async () => {
  await page.goto(`${BASE}/patients`);
  await page.getByRole("button", { name: "Register patient" }).click();
  const dialog = page.getByRole("dialog", { name: "Register patient" });
  await dialog.getByLabel("Gender").click();
  const listbox = page.getByRole("listbox");
  await assertTopLayer(listbox, "Gender options");
  await page.getByRole("option", { name: "Female", exact: true }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
});

async function checkLabPicker(label, selectionMethod) {
  await page.goto(`${BASE}/lab`);
  await page.getByRole("button", { name: "New lab order" }).click();
  const dialog = page.getByRole("dialog", { name: "New lab order" });
  const input = dialog.getByPlaceholder("Search by name, UHID or mobile");
  await input.fill("HMS-26");
  const listbox = page.getByRole("listbox", {
    name: "Patient search results",
  });
  await assertTopLayer(listbox, label);
  const firstOption = listbox.getByRole("option").first();
  await firstOption.waitFor({ state: "visible", timeout: 20_000 });
  if (selectionMethod === "pointer") {
    await firstOption.click();
  } else {
    await input.press("Enter");
  }
  await dialog.getByRole("button", { name: "Change patient" }).waitFor();
  await dialog.getByRole("button", { name: "Close" }).click();
}

await step("lab patient dropdown above dialog", async () => {
  await checkLabPicker("Lab patient results on desktop", "pointer");
});

await page.setViewportSize({ width: 390, height: 844 });
await step("lab patient dropdown on mobile", async () => {
  await checkLabPicker("Lab patient results on mobile", "keyboard");
});

await finish();
