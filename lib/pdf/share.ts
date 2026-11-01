import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { createDocumentQrDataUrl } from "@/components/shared/document-qr";
import { dataMode, performOperation } from "@/lib/api/data-source";
import { createPdfDataUrl, withShareQr } from "@/lib/pdf/layout";

export interface SharedPdf {
  data: string;
  publicUrl?: string;
}

const bytesFromDataUrl = (data: string) => {
  const base64 = data.slice(data.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
};

const dataUrlFromBytes = (mimeType: string, bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The scanned image could not be read."));
    image.src = source;
  });

async function stampImage(data: string, publicUrl: string) {
  const [source, qr] = await Promise.all([
    loadImage(data),
    createDocumentQrDataUrl(publicUrl).then(loadImage),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This browser cannot prepare the scanned document.");
  context.drawImage(source, 0, 0);
  const shortest = Math.min(canvas.width, canvas.height);
  const size = Math.round(Math.min(180, Math.max(64, shortest * 0.18)));
  const padding = Math.max(8, Math.round(size * 0.12));
  const x = canvas.width - size - padding;
  const y = canvas.height - size - padding;
  context.fillStyle = "white";
  context.fillRect(x - 3, y - 3, size + 6, size + 6);
  context.drawImage(qr, x, y, size, size);
  const mimeType = data.slice(5, data.indexOf(";"));
  return canvas.toDataURL(
    mimeType,
    mimeType === "image/jpeg" ? 0.92 : undefined
  );
}

async function stampPdf(data: string, publicUrl: string) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytesFromDataUrl(data));
  const qr = await pdf.embedPng(
    bytesFromDataUrl(await createDocumentQrDataUrl(publicUrl))
  );
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(64, Math.max(42, Math.min(width, height) * 0.11));
    const x = width - size - 16;
    const y = 16;
    page.drawRectangle({
      x: x - 3,
      y: y - 3,
      width: size + 6,
      height: size + 6,
      color: rgb(1, 1, 1),
    });
    page.drawImage(qr, { x, y, width: size, height: size });
  }
  return dataUrlFromBytes("application/pdf", await pdf.save());
}

export async function stampDocumentWithQr(data: string, publicUrl: string) {
  return data.startsWith("data:application/pdf;")
    ? stampPdf(data, publicUrl)
    : stampImage(data, publicUrl);
}

export interface SharedFile {
  data: string;
  publicUrl?: string;
}

/** Stamps and publishes a validated stored document snapshot. */
export async function buildSharedFile(
  userId: string,
  fileName: string,
  data: string
): Promise<SharedFile> {
  if (dataMode() !== "server") return { data };
  const token = crypto.randomUUID();
  const publicUrl = `${window.location.origin}/shared-documents/${token}`;
  const stamped = await stampDocumentWithQr(data, publicUrl);
  await performOperation(
    "document.share",
    { token, file: { name: fileName, data: stamped } },
    userId
  );
  return { data: stamped, publicUrl };
}

/**
 * Builds a PDF and, in PostgreSQL mode, stores an immutable public snapshot.
 * Browser-only demo data cannot be reached from another device, so it keeps
 * the existing local download behavior without claiming to publish a URL.
 */
export async function buildSharedPdf(
  userId: string,
  fileName: string,
  build: () => TDocumentDefinitions | Promise<TDocumentDefinitions>
): Promise<SharedPdf> {
  const doc = await build();
  if (dataMode() !== "server") return { data: await createPdfDataUrl(doc) };

  const token = crypto.randomUUID();
  const publicUrl = `${window.location.origin}/shared-documents/${token}`;
  const data = await createPdfDataUrl(withShareQr(doc, publicUrl));
  await performOperation(
    "document.share",
    { token, file: { name: fileName, data } },
    userId
  );
  return { data, publicUrl };
}
