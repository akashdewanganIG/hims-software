/**
 * Scanned copies for the seeded hospital: small but real one-page PDFs, so a
 * seeded document opened from the record shows a page rather than nothing.
 * Built by hand (a PDF is text plus byte offsets) so the seed stays
 * dependency-free and runs the same in the browser and on the server.
 */

/** PDF string literal: printable ASCII only, with its delimiters escaped. */
const literal = (text: string) =>
  `(${text.replace(/[^\x20-\x7e]/g, "-").replace(/[\\()]/g, c => `\\${c}`)})`;

export function onePagePdf(input: {
  heading: string;
  lines: string[];
  footer: string;
}) {
  const content = [
    `BT /F2 15 Tf 56 770 Td ${literal(input.heading)} Tj ET`,
    "0.6 w 56 756 m 539 756 l S",
    "BT /F1 11 Tf 56 736 Td 17 TL",
    ...input.lines.map(line => `${literal(line)} '`),
    "ET",
    `BT /F1 8 Tf 56 56 Td ${literal(input.footer)} Tj ET`,
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return `data:application/pdf;base64,${btoa(pdf)}`;
}

/** The signed general consent a ward nurse scans in on admission. */
export function consentFormScan(input: {
  hospital: string;
  patient: string;
  uhid: string;
  admissionCode: string;
  date: string;
  doctor: string;
}) {
  return onePagePdf({
    heading: "General consent for admission and treatment",
    lines: [
      input.hospital,
      "",
      `Patient: ${input.patient}    UHID: ${input.uhid}`,
      `Admission: ${input.admissionCode}    Date: ${input.date}`,
      `Treating doctor: ${input.doctor}`,
      "",
      "I consent to admission, examination, investigations and the treatment",
      "the treating doctor and the care team consider necessary. The nature of",
      "the illness, the plan of care and its common risks were explained to me",
      "in a language I understand. I may withdraw this consent at any time.",
      "",
      "Signature of patient / attendant: ______________________________",
      "Relationship (if attendant): __________    Witness (staff): __________",
    ],
    footer:
      "Scanned copy - HIMS Simulation, fictional data. Not a legal document.",
  });
}
