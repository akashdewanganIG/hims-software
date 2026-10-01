"use client";

import * as React from "react";

import { FilePicker } from "@/components/shared/files";
import { Field } from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { useAction } from "@/lib/api/client";
import { humanize } from "@/lib/format";
import { DOCUMENT_KINDS, type DocumentKind, type ID } from "@/lib/sim/schema";
import type { PreparedUpload } from "@/lib/uploads";

/**
 * Uploads a document to the patient record — a scanned consent form, an
 * outside report, an ID proof — as a PDF or an image, filed against a visit
 * or admission when it belongs to one.
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  patientId,
  contexts,
  defaultContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: ID;
  /** Encounters/admissions the document can be filed against. */
  contexts: Array<{
    value: string;
    label: string;
    encounterId?: ID;
    admissionId?: ID;
  }>;
  defaultContext?: string;
}) {
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<DocumentKind>("EXTERNAL_REPORT");
  const [context, setContext] = React.useState("");
  const [file, setFile] = React.useState<PreparedUpload | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setKind("EXTERNAL_REPORT");
    setContext(defaultContext ?? "");
    setFile(null);
  }, [open, defaultContext]);

  const target = contexts.find(c => c.value === context);
  const save = useAction(
    "document.add",
    () => ({
      patientId,
      encounterId: target?.encounterId,
      admissionId: target?.admissionId,
      title,
      kind: kind as Exclude<DocumentKind, "DISCHARGE_SUMMARY">,
      file: { name: file!.name, data: file!.data },
    }),
    {
      success: "Document uploaded to the patient record",
      onSuccess: () => onOpenChange(false),
    }
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload document"
      description="A PDF or a photo of the page. It is kept with the patient record and can be viewed, downloaded or removed later."
      size="md"
      submitLabel="Upload"
      isSubmitting={save.isPending}
      submitDisabled={!file || !title.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="File" required>
        <FilePicker
          purpose="document"
          value={file}
          label="Document file"
          onChange={upload => {
            setFile(upload);
            if (upload && !title)
              setTitle(
                upload.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")
              );
          }}
        />
      </Field>
      <Field label="Title" required>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. MRI knee report — outside lab"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <SelectField
            value={kind}
            onChange={e => setKind(e.target.value as DocumentKind)}
          >
            {DOCUMENT_KINDS.filter(k => k !== "DISCHARGE_SUMMARY").map(k => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field
          label="File against"
          hint="Linked documents count towards the MRD checklist"
        >
          <SelectField
            value={context}
            onChange={e => setContext(e.target.value)}
          >
            <option value="">Patient record only</option>
            {contexts.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
        </Field>
      </div>
    </FormDialog>
  );
}

/** Corrects an uploaded document's title or type. */
export function EditDocumentDialog({
  document,
  onClose,
}: {
  document: { id: ID; title: string; kind: string } | null;
  onClose: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<DocumentKind>("EXTERNAL_REPORT");

  React.useEffect(() => {
    if (!document) return;
    setTitle(document.title);
    setKind(document.kind as DocumentKind);
  }, [document]);

  const save = useAction(
    "document.update",
    () => ({
      documentId: document!.id,
      title,
      kind: kind as Exclude<DocumentKind, "DISCHARGE_SUMMARY">,
    }),
    { success: "Document updated", onSuccess: onClose }
  );

  return (
    <FormDialog
      open={Boolean(document)}
      onOpenChange={open => !open && onClose()}
      title="Edit document"
      description="Correct the title or type. The file itself stays as uploaded."
      size="md"
      submitLabel="Save changes"
      isSubmitting={save.isPending}
      submitDisabled={
        !title.trim() ||
        (title.trim() === document?.title && kind === document?.kind)
      }
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Title" required>
        <Input value={title} onChange={e => setTitle(e.target.value)} />
      </Field>
      <Field label="Type">
        <SelectField
          value={kind}
          onChange={e => setKind(e.target.value as DocumentKind)}
        >
          {DOCUMENT_KINDS.filter(k => k !== "DISCHARGE_SUMMARY").map(k => (
            <option key={k} value={k}>
              {humanize(k)}
            </option>
          ))}
        </SelectField>
      </Field>
    </FormDialog>
  );
}
