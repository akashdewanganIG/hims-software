const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SpreadsheetCell = string | number | boolean | null | undefined;

export interface SpreadsheetColumn {
  header: string;
}

export interface SpreadsheetExport {
  fileName: string;
  title: string;
  columns: SpreadsheetColumn[];
  rows: SpreadsheetCell[][];
}

const BRAND = {
  primary: "FF0F766E",
  primaryDark: "FF115E59",
  primarySoft: "FFCCFBF1",
  ink: "FF0F172A",
  muted: "FF64748B",
  border: "FFCBD5E1",
  stripe: "FFF8FAFC",
  white: "FFFFFFFF",
};

/** Download a presentation-ready workbook without putting ExcelJS in the main bundle. */
export async function downloadStyledWorkbook({
  ...options
}: SpreadsheetExport) {
  const bytes = await buildStyledWorkbook(options);
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${options.fileName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Exposed separately so the workbook structure can be verified without a browser. */
export async function buildStyledWorkbook({
  title,
  columns,
  rows,
}: SpreadsheetExport) {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HIMS";
  workbook.company = "Hospital Information Management System";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(safeSheetName(title), {
    properties: {
      defaultRowHeight: 20,
      tabColor: { argb: BRAND.primary },
    },
    pageSetup: {
      orientation: columns.length > 6 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
    views: [{ state: "frozen", ySplit: 5, activeCell: "A6" }],
  });

  const lastColumn = Math.max(1, columns.length);
  const lastColumnLetter = columnLetter(lastColumn);
  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  sheet.mergeCells(`A1:${lastColumnLetter}1`);
  sheet.mergeCells(`A2:${lastColumnLetter}2`);
  sheet.mergeCells(`A3:${lastColumnLetter}3`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18, color: { argb: BRAND.white } };
  titleCell.fill = solid(BRAND.primary);
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  titleCell.border = {
    bottom: { style: "medium", color: { argb: BRAND.primaryDark } },
  };
  sheet.getRow(1).height = 34;

  const contextCell = sheet.getCell("A2");
  contextCell.value = "HIMS  /  Operational data export";
  contextCell.font = {
    bold: true,
    size: 10,
    color: { argb: BRAND.primaryDark },
  };
  contextCell.fill = solid(BRAND.primarySoft);
  contextCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(2).height = 24;

  const metaCell = sheet.getCell("A3");
  metaCell.value = `Generated ${generatedAt}  |  ${rows.length.toLocaleString("en-IN")} ${rows.length === 1 ? "record" : "records"}`;
  metaCell.font = { italic: true, size: 9, color: { argb: BRAND.muted } };
  metaCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(3).height = 22;
  sheet.getRow(4).height = 8;

  const headerRow = sheet.getRow(5);
  headerRow.values = columns.map(column => column.header);
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 10, color: { argb: BRAND.white } };
    cell.fill = solid(BRAND.primaryDark);
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.primaryDark } },
      bottom: { style: "medium", color: { argb: BRAND.primary } },
    };
  });

  rows.forEach((values, index) => {
    const row = sheet.addRow(values.map(value => value ?? ""));
    row.height = 22;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { size: 10, color: { argb: BRAND.ink } };
      cell.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: BRAND.border } },
      };
      if (index % 2 === 1) cell.fill = solid(BRAND.stripe);
    });
  });

  sheet.columns.forEach((column, index) => {
    const values = [
      columns[index]?.header ?? "",
      ...rows.map(row => displayLength(row[index])),
    ];
    const longest = Math.max(...values.map(value => String(value).length));
    column.width = Math.min(42, Math.max(12, longest + 2));
  });

  if (columns.length) {
    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: 5, column: columns.length },
    };
    sheet.pageSetup.printArea = `A1:${lastColumnLetter}${Math.max(5, rows.length + 5)}`;
    sheet.pageSetup.printTitlesRow = "1:5";
  }

  sheet.headerFooter.oddFooter = `&L HIMS  |  ${title.slice(0, 60)}&RPage &P of &N`;
  sheet.headerFooter.evenFooter = sheet.headerFooter.oddFooter;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function solid(argb: string) {
  return {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb },
  };
}

function displayLength(value: SpreadsheetCell) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/^'/, "");
}

function safeSheetName(value: string) {
  return (
    value
      .replace(/[\\/*?:[\]]/g, " ")
      .trim()
      .slice(0, 31) || "Export"
  );
}

function columnLetter(value: number) {
  let result = "";
  for (let number = value; number > 0; number = Math.floor((number - 1) / 26)) {
    result = String.fromCharCode(((number - 1) % 26) + 65) + result;
  }
  return result;
}
