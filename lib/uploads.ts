/**
 * Getting a file ready to upload, in the browser. Photos and scanned images
 * are downscaled and re-encoded as JPEG — a phone photo is several megabytes,
 * a record needs a fraction of that — while PDFs are sent as they are.
 */

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp";

/** Matches the server's limit (lib/domain/files.ts). */
export const MAX_UPLOAD_MB = 5;

export interface PreparedUpload {
  name: string;
  /** base64 `data:` URL */
  data: string;
  mimeType: string;
  sizeKb: number;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function dataUrlSizeKb(data: string) {
  const base64 = data.slice(data.indexOf(",") + 1);
  return Math.max(1, Math.ceil((base64.length * 3) / 4 / 1024));
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("The file could not be read. Choose it again."));
    reader.readAsDataURL(file);
  });
}

async function downscale(file: File, maxSide: number) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image could not be opened. Try a JPG or PNG.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare images.");
  // JPEG has no transparency: flatten onto white.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

const isPdf = (file: File) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/**
 * Validates and prepares a chosen file. `photo` accepts images only and
 * keeps them small; `document` also accepts PDFs.
 */
export async function prepareUpload(
  file: File,
  purpose: "photo" | "document"
): Promise<PreparedUpload> {
  const image = IMAGE_TYPES.has(file.type);
  if (purpose === "photo" && !image)
    throw new Error("Choose a JPG, PNG or WebP image.");
  if (purpose === "document" && !image && !isPdf(file))
    throw new Error("Choose a PDF or a JPG, PNG or WebP image.");

  if (!image) {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024)
      throw new Error(
        `PDFs can be up to ${MAX_UPLOAD_MB} MB; this one is ${(file.size / 1024 / 1024).toFixed(1)} MB.`
      );
    const raw = await readAsDataUrl(file);
    const data = raw.replace(/^data:[^,]*,/, "data:application/pdf;base64,");
    return {
      name: file.name,
      data,
      mimeType: "application/pdf",
      sizeKb: dataUrlSizeKb(data),
    };
  }

  if (file.size > 40 * 1024 * 1024)
    throw new Error("That image is too large to process (over 40 MB).");
  const data = await downscale(file, purpose === "photo" ? 720 : 2000);
  const sizeKb = dataUrlSizeKb(data);
  if (sizeKb > MAX_UPLOAD_MB * 1024)
    throw new Error(
      `The image is still over ${MAX_UPLOAD_MB} MB once reduced.`
    );
  return {
    name: `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`,
    data,
    mimeType: "image/jpeg",
    sizeKb,
  };
}

/** A data URL as an object URL — viewable in frames and downloadable. */
export function dataUrlToObjectUrl(data: string) {
  const comma = data.indexOf(",");
  const mimeType = data.slice(5, data.indexOf(";"));
  const binary = atob(data.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/** Saves a data URL to the user's device under `name`. */
export function downloadDataUrl(name: string, data: string) {
  const url = dataUrlToObjectUrl(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
