/**
 * Uploaded files: photos of patients and staff, scanned copies of patient
 * documents and photos attached to complaints. The browser sends the content
 * as a base64 `data:` URL (images already downscaled); it is validated here
 * and kept in the `files` table, apart from the rows that list it.
 */
import type { Database, FileOwner, ID, StoredFile } from "../sim/schema";
import { assert, newId, nowIso, requireText, type Tx } from "../sim/tx";

/** What an upload carries: the original file name and its content. */
export interface FileInput {
  name: string;
  data: string;
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;

/** Largest file accepted, in KB — a scanned multi-page PDF fits easily. */
const MAX_FILE_KB = 5 * 1024;

const TYPE_LABEL: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
  "image/svg+xml": "SVG",
};

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/;

/** How each type's content starts, base64-encoded ("%PDF", JPEG SOI, …). */
const MAGIC: Record<string, string> = {
  "application/pdf": "JVBER",
  "image/jpeg": "/9j/",
  "image/png": "iVBORw0KGgo",
  "image/webp": "UklGR",
};

/** Type and decoded size of a base64 data URL. */
export function describeDataUrl(data: string) {
  const match = DATA_URL.exec(data);
  assert(match, "The file could not be read. Choose it again.");
  const base64 = match[2]!;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = (base64.length * 3) / 4 - padding;
  assert(bytes > 0, "The file is empty.");
  return { mimeType: match[1]!, sizeKb: Math.max(1, Math.ceil(bytes / 1024)) };
}

/** Keeps the name readable and safe to offer back as a download name. */
function cleanName(name: string) {
  const safe = Array.from(requireText(name, "File name"), char =>
    char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? "-" : char
  ).join("");
  return safe.replace(/-{2,}/g, "-").slice(-120) || "file";
}

export function storeFile(
  tx: Tx,
  owner: { type: FileOwner; id: ID },
  input: FileInput,
  allowed: readonly string[]
): StoredFile {
  const { mimeType, sizeKb } = describeDataUrl(input.data);
  assert(
    allowed.includes(mimeType),
    `Upload a ${allowed.map(t => TYPE_LABEL[t] ?? t).join(", ")} file.`
  );
  assert(
    sizeKb <= MAX_FILE_KB,
    `Files can be up to ${MAX_FILE_KB / 1024} MB; this one is ${(sizeKb / 1024).toFixed(1)} MB.`
  );
  const magic = MAGIC[mimeType];
  assert(
    !magic || input.data.startsWith(magic, input.data.indexOf(",") + 1),
    `The file is not a real ${TYPE_LABEL[mimeType] ?? mimeType}. Choose it again.`
  );
  const file: StoredFile = {
    id: newId(tx, "fil"),
    ownerType: owner.type,
    ownerId: owner.id,
    name: cleanName(input.name),
    mimeType,
    sizeKb,
    data: input.data,
    uploadedAt: nowIso(tx),
    uploadedById: tx.actorId,
  };
  tx.db.files.push(file);
  return file;
}

export function filesOf(db: Database, type: FileOwner, ownerId: ID) {
  return db.files.filter(f => f.ownerType === type && f.ownerId === ownerId);
}

/** The one file a photo or document owner holds, if any. */
export function fileOf(db: Database, type: FileOwner, ownerId: ID) {
  return db.files.find(f => f.ownerType === type && f.ownerId === ownerId);
}

/** Removes every file of an owner; returns how many went. */
export function removeFilesOf(tx: Tx, type: FileOwner, ownerId: ID) {
  const before = tx.db.files.length;
  tx.db.files = tx.db.files.filter(
    f => !(f.ownerType === type && f.ownerId === ownerId)
  );
  return before - tx.db.files.length;
}

/** What lists show of a file — never its content. */
export interface FileSummary {
  id: ID;
  name: string;
  mimeType: string;
  sizeKb: number;
  uploadedAt: string;
}

export function summariseFile(file: StoredFile): FileSummary;
export function summariseFile(file?: StoredFile): FileSummary | undefined;
export function summariseFile(file?: StoredFile) {
  if (!file) return undefined;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeKb: file.sizeKb,
    uploadedAt: file.uploadedAt,
  };
}
