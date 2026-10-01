/**
 * Downloadable PDFs of the hospital's records, built with pdfmake: real text
 * (searchable, selectable, accessible), the hospital letterhead on every
 * page, tables whose header row repeats across page breaks, and page numbers.
 *
 * pdfmake and its fonts load only when someone downloads, so they never
 * weigh on the screens themselves.
 */
import type {
  Content,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";

import { formatDateTime } from "@/lib/format";
import { HOSPITAL } from "@/lib/sim/reference";

export type { Content };

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";
const TINT = "#f3f4f6";

/** A file name that is safe on every system: "Prescription-ENC-2609-00012.pdf". */
export function pdfName(...parts: string[]) {
  return `${parts
    .join("-")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")}.pdf`;
}

export async function downloadPdf(fileName: string, doc: TDocumentDefinitions) {
  const [pdfModule, fontModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  type PdfMake = typeof import("pdfmake/build/pdfmake");
  const pdfMake = ((pdfModule as { default?: PdfMake }).default ??
    pdfModule) as PdfMake;
  const vfs = ((fontModule as { default?: unknown }).default ??
    fontModule) as Parameters<PdfMake["addVirtualFileSystem"]>[0];
  pdfMake.addVirtualFileSystem(vfs);
  // Records embed their images as data URLs; nothing is fetched.
  pdfMake.setUrlAccessPolicy(() => false);
  await pdfMake.createPdf(doc).download(fileName);
}

/**
 * The letterhead every record shares: the hospital (with the logo
 * placeholder) and the document's title and reference on each page, and
 * the generation time and page numbers in the footer.
 */
export function recordDocument({
  title,
  reference,
  content,
  signature,
}: {
  title: string;
  reference: string;
  content: Content[];
  /** Signature block closing the document (signatory, department). */
  signature?: string[];
}): TDocumentDefinitions {
  const generated = formatDateTime(new Date());
  return {
    pageSize: "A4",
    pageMargins: [40, 104, 40, 56],
    info: {
      title: `${title} ${reference}`,
      author: HOSPITAL.name,
      creator: "HIMS Simulation",
      subject: title,
    },
    header: asLetterhead({
      margin: [40, 28, 40, 0],
      stack: [
        {
          columns: [
            {
              width: 50,
              stack: [
                {
                  canvas: [
                    {
                      type: "rect",
                      x: 0,
                      y: 0,
                      w: 50,
                      h: 40,
                      r: 5,
                      lineWidth: 0.8,
                      lineColor: "#9ca3af",
                      dash: { length: 2, space: 2 },
                    },
                  ],
                },
                {
                  text: "Your logo\nhere",
                  alignment: "center",
                  fontSize: 6.5,
                  color: MUTED,
                  relativePosition: { x: 0, y: -30 },
                },
              ],
            },
            {
              width: "*",
              stack: [
                { text: HOSPITAL.name, fontSize: 14, bold: true },
                { text: HOSPITAL.address, fontSize: 8, color: MUTED },
                { text: `Tel ${HOSPITAL.phone}`, fontSize: 8, color: MUTED },
              ],
            },
            {
              width: "auto",
              alignment: "right",
              stack: [
                {
                  text: title.toUpperCase(),
                  fontSize: 11,
                  bold: true,
                  characterSpacing: 0.6,
                },
                {
                  text: reference,
                  fontSize: 8.5,
                  color: MUTED,
                  margin: [0, 2, 0, 0],
                },
              ],
            },
          ],
          columnGap: 10,
        },
        {
          canvas: [
            {
              type: "line",
              x1: 0,
              y1: 10,
              x2: 515,
              y2: 10,
              lineWidth: 1.4,
              lineColor: INK,
            },
          ],
        },
      ],
    }),
    footer: (page, pages) =>
      asLetterhead({
        margin: [40, 18, 40, 0],
        columns: [
          {
            text: `Generated ${generated} · HIMS Simulation — fictional data, not a medical or tax document.`,
            fontSize: 7,
            color: MUTED,
          },
          {
            text: `Page ${page} of ${pages}`,
            width: "auto",
            fontSize: 7,
            color: MUTED,
          },
        ],
      }),
    // A heading never ends a page: it moves over with what it introduces
    // (the letterhead and footer of the page do not count). Nor does the
    // signature stand alone on one: when the last section ends on an
    // earlier page than the document does, only the signature is left for
    // the last page, so the section moves over with it.
    pageBreakBefore: (node, nodes) => {
      if (node.headlineLevel === KEEP_WITH_SIGNATURE)
        return (
          node.pageNumbers.length === 1 &&
          node.pageNumbers[0]! < node.pages &&
          node.startPosition.verticalRatio > 0.2
        );
      return (
        node.headlineLevel === SECTION &&
        !nodes
          .getFollowingNodesOnPage()
          .some(
            next =>
              next.headlineLevel !== LETTERHEAD &&
              next.startPosition.pageNumber === node.startPosition.pageNumber
          )
      );
    },
    content: [
      ...(signature?.length ? keepLastSection(content) : content),
      ...(signature?.length
        ? [
            {
              unbreakable: true,
              margin: [0, 28, 0, 0] as [number, number, number, number],
              columns: [
                { width: "*", text: "" },
                {
                  width: 180,
                  stack: [
                    {
                      canvas: [
                        {
                          type: "line" as const,
                          x1: 0,
                          y1: 0,
                          x2: 180,
                          y2: 0,
                          lineWidth: 0.7,
                          lineColor: MUTED,
                        },
                      ],
                    },
                    {
                      text: signature[0]!,
                      bold: true,
                      margin: [0, 4, 0, 0],
                    },
                    ...signature.slice(1).map(line => ({
                      text: line,
                      fontSize: 8,
                      color: MUTED,
                    })),
                  ],
                },
              ],
            } satisfies Content,
          ]
        : []),
    ],
    defaultStyle: {
      font: "Roboto",
      fontSize: 9.5,
      lineHeight: 1.2,
      color: INK,
    },
    styles: {
      label: {
        fontSize: 7,
        bold: true,
        color: MUTED,
        characterSpacing: 0.5,
      },
      section: {
        fontSize: 9,
        bold: true,
        characterSpacing: 0.6,
        margin: [0, 14, 0, 6],
      },
      th: { fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.4 },
      note: { fontSize: 7.5, color: MUTED },
    },
  };
}

// Headline levels mark nodes for `pageBreakBefore`.
const SECTION = 1;
const KEEP_WITH_SIGNATURE = 2;
const LETTERHEAD = 9;

/** Marks every node of the letterhead or footer, so page breaks can tell them from the body. */
function asLetterhead<T>(node: T): T {
  if (Array.isArray(node)) node.forEach(asLetterhead);
  else if (node && typeof node === "object") {
    const element = node as {
      headlineLevel?: number;
      stack?: unknown;
      columns?: unknown;
    };
    element.headlineLevel = LETTERHEAD;
    asLetterhead(element.stack);
    asLetterhead(element.columns);
  }
  return node;
}

/** Groups the last section (its heading onwards) so it can move with the signature. */
function keepLastSection(content: Content[]): Content[] {
  let start = content.length - 1;
  for (let i = content.length - 1; i >= 0; i -= 1)
    if ((content[i] as { headlineLevel?: number }).headlineLevel === SECTION) {
      start = i;
      break;
    }
  if (start < 0) return content;
  return [
    ...content.slice(0, start),
    { headlineLevel: KEEP_WITH_SIGNATURE, stack: content.slice(start) },
  ];
}

/** Section heading; it never ends a page (see `pageBreakBefore`). */
export function section(title: string): Content {
  return {
    text: title.toUpperCase(),
    style: "section",
    headlineLevel: SECTION,
  };
}

/** Label-over-value pairs laid out in a grid, as on the printed record. */
export function fields(
  pairs: Array<[label: string, value: string | undefined]>,
  columns = 4
): Content {
  const cells: TableCell[] = pairs.map(([label, value]) => ({
    stack: [
      { text: label.toUpperCase(), style: "label" },
      { text: value?.trim() ? value : "—", margin: [0, 1, 0, 0] },
    ],
    margin: [0, 0, 8, 7],
  }));
  const rows: TableCell[][] = [];
  for (let i = 0; i < cells.length; i += columns) {
    const row = cells.slice(i, i + columns);
    while (row.length < columns) row.push({ text: "" });
    rows.push(row);
  }
  return {
    table: { widths: Array(columns).fill("*"), body: rows },
    layout: "noBorders",
  };
}

/** A labelled paragraph (diagnosis, advice, course in hospital…). */
export function paragraph(label: string, text: string | undefined): Content {
  return {
    stack: [
      { text: label.toUpperCase(), style: "label" },
      { text: text?.trim() ? text : "—", margin: [0, 1, 0, 0] },
    ],
    margin: [0, 0, 0, 8],
  };
}

export interface Column {
  header: string;
  width?: number | "*" | "auto";
  align?: "left" | "right" | "center";
}

/**
 * A data table: header row on a light band (repeated on every page),
 * hairlines between rows, numbers right-aligned.
 */
export function dataTable(
  columns: Column[],
  rows: Array<Array<string | number | Content>>,
  empty = "None."
): Content {
  if (!rows.length) return { text: empty, style: "note", margin: [0, 0, 0, 6] };
  const header = columns.map(c => ({
    text: c.header.toUpperCase(),
    style: "th",
    alignment: c.align ?? "left",
  }));
  const body: TableCell[][] = [
    header,
    ...rows.map(row =>
      row.map((cell, index) =>
        typeof cell === "string" || typeof cell === "number"
          ? { text: String(cell), alignment: columns[index]?.align ?? "left" }
          : (cell as TableCell)
      )
    ),
  ];
  const table: ContentTable = {
    table: {
      headerRows: 1,
      // A row never splits across pages.
      dontBreakRows: true,
      widths: columns.map(c => c.width ?? "*"),
      body,
    },
    layout: {
      fillColor: rowIndex => (rowIndex === 0 ? TINT : null),
      hLineWidth: (i, node) =>
        i === 0 || i === node.table.body.length ? 0 : i === 1 ? 0.8 : 0.4,
      hLineColor: i => (i === 1 ? "#9ca3af" : RULE),
      vLineWidth: () => 0,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: i => (i === 0 ? 6 : 4),
      paddingRight: (i, node) =>
        i === (node.table.widths?.length ?? 1) - 1 ? 6 : 4,
    },
    margin: [0, 0, 0, 6],
  };
  return table;
}

/** Right-aligned money summary (gross, discount, net, received, balance). */
export function totals(
  lines: Array<[label: string, value: string, strong?: boolean]>
): Content {
  return {
    columns: [
      { width: "*", text: "" },
      {
        width: 220,
        table: {
          widths: ["*", "auto"],
          body: lines.map(([label, value, strong]) => [
            { text: label, bold: strong },
            { text: value, bold: strong, alignment: "right" },
          ]),
        },
        layout: {
          hLineWidth: (i, node) =>
            i > 0 && i < node.table.body.length && lines[i]?.[2] ? 0.8 : 0,
          vLineWidth: () => 0,
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
      },
    ],
    margin: [0, 4, 0, 6],
    unbreakable: true,
  };
}
