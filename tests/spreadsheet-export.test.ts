import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { buildStyledWorkbook } from "../lib/spreadsheet-export";

test("styled spreadsheet export keeps its report layout", async () => {
  const bytes = await buildStyledWorkbook({
    fileName: "patients",
    title: "Patient Records",
    columns: [{ header: "UHID" }, { header: "Patient" }],
    rows: [
      ["UH-1001", "Asha Singh"],
      ["UH-1002", "Ravi Kumar"],
    ],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer);
  const sheet = workbook.worksheets[0];
  assert.ok(sheet);

  assert.equal(sheet.getCell("A1").value, "Patient Records");
  assert.equal(sheet.getCell("A5").value, "UHID");
  assert.equal(sheet.getCell("A6").value, "UH-1001");
  assert.equal(sheet.getCell("A7").value, "UH-1002");
  assert.equal(sheet.getCell("A1").fill.type, "pattern");
  assert.equal(sheet.getCell("A1").font.color?.argb, "FFFFFFFF");
  assert.deepEqual(sheet.autoFilter, "A5:B5");
  assert.equal(sheet.views[0]?.state, "frozen");
  assert.equal(sheet.views[0]?.ySplit, 5);
});
