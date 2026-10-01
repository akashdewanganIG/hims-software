/**
 * Uploaded file content, read one file at a time. Lists carry only file
 * summaries; the content is fetched when a photo is shown or a document is
 * opened.
 */
import type { Actor } from "@/lib/ops/execute";
import type { Module } from "@/lib/rbac";
import type { Database, FileOwner, ID } from "@/lib/sim/schema";

/** A file is readable by the roles that can open where its owner is shown. */
const OWNER_MODULES: Record<FileOwner, readonly Module[]> = {
  PATIENT_PHOTO: [
    "ehr",
    "opd",
    "ipd",
    "lab",
    "pharmacy",
    "billing",
    "mrd",
    "beds",
    "enquiry",
  ],
  DOCUMENT: ["ehr", "mrd", "opd", "ipd"],
  STAFF_PHOTO: ["wfm", "admin"],
  COMPLAINT: ["complaints"],
};

export interface FileContent {
  id: ID;
  name: string;
  mimeType: string;
  sizeKb: number;
  /** base64 `data:` URL */
  data: string;
}

/** One file, or null when it is missing or not this login's to see. */
export function fileView(
  db: Database,
  _now: Date,
  { id }: { id: ID },
  actor: Actor
): FileContent | null {
  const file = db.files.find(f => f.id === id);
  if (!file) return null;
  const ownPhoto =
    file.ownerType === "STAFF_PHOTO" && file.ownerId === actor.staff.id;
  if (
    !ownPhoto &&
    !OWNER_MODULES[file.ownerType].some(m => actor.access.modules.has(m))
  )
    return null;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeKb: file.sizeKb,
    data: file.data,
  };
}
