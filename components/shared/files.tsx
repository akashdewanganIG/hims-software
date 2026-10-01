"use client";

import * as React from "react";

import {
  Camera,
  Download,
  FilePdf,
  ImageSquare,
  Trash2,
  Upload,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoredFile } from "@/lib/api/client";
import { initials } from "@/lib/format";
import {
  DOCUMENT_ACCEPT,
  MAX_UPLOAD_MB,
  PHOTO_ACCEPT,
  dataUrlToObjectUrl,
  downloadDataUrl,
  prepareUpload,
  type PreparedUpload,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";

export const formatFileSize = (sizeKb: number) =>
  sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

/** A person's photo when one is on file, their initials otherwise. */
export function PersonPhoto({
  fileId,
  name,
  className,
}: {
  fileId?: string;
  name: string;
  className?: string;
}) {
  const { data, isLoading } = useStoredFile(fileId);
  const box = cn(
    "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-surface text-sm font-semibold text-primary-surface-foreground",
    className
  );
  if (fileId && isLoading) return <Skeleton className={box} />;
  if (data)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- stored data URL
      <img
        src={data.data}
        alt={`Photo of ${name}`}
        className={cn(box, "bg-surface-subtle object-cover")}
      />
    );
  return (
    <span className={box} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/**
 * Choose a file by click or drag-and-drop. Images are downscaled before
 * they leave the browser; the prepared upload is handed to `onChange`.
 */
export function FilePicker({
  id,
  purpose,
  value,
  onChange,
  disabled,
  label,
}: {
  /** Set by a surrounding `Field`, so its label names the input. */
  id?: string;
  purpose: "photo" | "document";
  value: PreparedUpload | null;
  onChange: (upload: PreparedUpload | null) => void;
  disabled?: boolean;
  /** Accessible name of the file input when there is no `Field`. */
  label?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await prepareUpload(file, purpose));
    } catch (cause) {
      onChange(null);
      setError(cause instanceof Error ? cause.message : "Could not read file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const accept = purpose === "photo" ? PHOTO_ACCEPT : DOCUMENT_ACCEPT;
  const hint =
    purpose === "photo"
      ? "JPG, PNG or WebP — reduced for the record automatically."
      : `PDF up to ${MAX_UPLOAD_MB} MB, or a JPG, PNG or WebP image.`;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDragOver={event => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) void take(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
          dragging
            ? "border-primary bg-primary-surface"
            : "border-border-strong bg-surface-subtle hover:border-primary/60",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        <Upload className="size-5 text-muted-foreground" />
        <span className="text-[0.8125rem] font-medium text-foreground">
          {busy
            ? "Preparing…"
            : value
              ? "Choose a different file"
              : "Choose a file or drop it here"}
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          aria-label={id ? undefined : (label ?? "File")}
          className="sr-only"
          disabled={disabled || busy}
          onChange={event => void take(event.target.files?.[0])}
        />
      </label>
      {error ? (
        <p className="text-xs font-medium text-error-foreground" role="alert">
          {error}
        </p>
      ) : null}
      {value ? (
        <UploadPreview upload={value} onClear={() => onChange(null)} />
      ) : null}
    </div>
  );
}

function UploadPreview({
  upload,
  onClear,
}: {
  upload: PreparedUpload;
  onClear: () => void;
}) {
  const image = upload.mimeType.startsWith("image/");
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview
        <img
          src={upload.data}
          alt=""
          className="size-12 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-error-surface text-error-foreground">
          <FilePdf className="size-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-medium">{upload.name}</p>
        <p className="text-xs text-muted-foreground">
          {image ? "Image" : "PDF"} · {formatFileSize(upload.sizeKb)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Clear the chosen file"
        onClick={onClear}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/** Opens a stored file: images inline, PDFs in the browser's viewer. */
export function FilePreviewDialog({
  file,
  title,
  onOpenChange,
}: {
  file: { id: string; name: string; mimeType: string; sizeKb: number } | null;
  title?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useStoredFile(file?.id);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!data || data.mimeType !== "application/pdf") return;
    const url = dataUrlToObjectUrl(data.data);
    setPdfUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPdfUrl(null);
    };
  }, [data]);

  return (
    <Dialog open={Boolean(file)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title ?? file?.name ?? "File"}</DialogTitle>
          {file ? (
            <DialogDescription>
              {file.name} · {formatFileSize(file.sizeKb)}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <Skeleton className="h-[60svh] w-full" />
          ) : error || !data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              This file could not be opened.
            </p>
          ) : data.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- stored data URL
            <img
              src={data.data}
              alt={title ?? data.name}
              className="mx-auto max-h-[65svh] rounded-md border border-border object-contain"
            />
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={title ?? data.name}
              className="h-[65svh] w-full rounded-md border border-border bg-white"
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={!data}
            onClick={() => data && downloadDataUrl(data.name, data.data)}
          >
            <Download className="size-4" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A person's photo with Upload / Change / Remove, for a patient or a staff
 * member. The caller supplies the save and remove operations.
 */
export function PhotoDialog({
  open,
  onOpenChange,
  name,
  fileId,
  onSave,
  onRemove,
  saving,
  removing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  fileId?: string;
  onSave: (upload: PreparedUpload) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  saving: boolean;
  removing: boolean;
}) {
  const [upload, setUpload] = React.useState<PreparedUpload | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) setUpload(null);
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Photo</DialogTitle>
            <DialogDescription>
              Used to identify {name} across the record.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex items-center gap-4">
              {upload ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview
                <img
                  src={upload.data}
                  alt="New photo"
                  className="size-24 shrink-0 rounded-xl border border-border object-cover"
                />
              ) : (
                <PersonPhoto
                  fileId={fileId}
                  name={name}
                  className="size-24 rounded-xl text-2xl"
                />
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                {upload
                  ? "Save to replace the photo on file."
                  : fileId
                    ? "A photo is on file. Choose a new one to replace it, or remove it."
                    : "No photo on file yet."}
              </p>
            </div>
            <div className="mt-4">
              <FilePicker
                purpose="photo"
                value={upload}
                onChange={setUpload}
                label="Photo file"
              />
            </div>
          </DialogBody>
          <DialogFooter className={fileId ? "sm:justify-between" : undefined}>
            {fileId ? (
              <Button
                type="button"
                variant="outline"
                className="text-error-foreground"
                disabled={removing || saving}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="size-4" />
                Remove photo
              </Button>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="raised"
                disabled={!upload || saving}
                onClick={() =>
                  upload &&
                  onSave(upload)
                    .then(() => onOpenChange(false))
                    .catch(() => undefined)
                }
              >
                <Camera className="size-4" />
                {saving ? "Saving…" : "Save photo"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove photo?"
        description={`The photo of ${name} will be removed from the record.`}
        confirmText="Remove photo"
        variant="destructive"
        isLoading={removing}
        onConfirm={async () => {
          await onRemove();
          onOpenChange(false);
        }}
      />
    </>
  );
}

/** A stored image as a square thumbnail that opens the preview. */
export function StoredThumbnail({
  file,
  onOpen,
}: {
  file: { id: string; name: string };
  onOpen: () => void;
}) {
  const { data, isLoading } = useStoredFile(file.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${file.name}`}
      className="block aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface-subtle outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {isLoading || !data ? (
        <Skeleton className="size-full rounded-none" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- stored data URL
        <img
          src={data.data}
          alt={file.name}
          className="size-full object-cover"
        />
      )}
    </button>
  );
}

/** Small file-type badge for document lists. */
export function FileKindIcon({ mimeType }: { mimeType?: string }) {
  if (mimeType === "application/pdf")
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-error-surface text-error-foreground">
        <FilePdf className="size-4" />
      </span>
    );
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info-surface text-info-foreground">
      <ImageSquare className="size-4" />
    </span>
  );
}
