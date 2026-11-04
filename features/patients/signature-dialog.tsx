"use client";

import * as React from "react";

import { Camera, Edit, Trash2 } from "@/components/icons";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { useStoredFile } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { PreparedUpload } from "@/lib/uploads";

type SignatureSource = "DRAWN" | "OCR_SCAN";
type SignerType = "PATIENT" | "ATTENDANT";

export interface SignatureCapture {
  upload: PreparedUpload;
  source: SignatureSource;
  signerType: SignerType;
  relationship?: string;
}

export function PatientSignatureDialog({
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
  onSave: (capture: SignatureCapture) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  saving: boolean;
  removing: boolean;
}) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const drawing = React.useRef(false);
  const [source, setSource] = React.useState<SignatureSource>("DRAWN");
  const [scan, setScan] = React.useState<PreparedUpload | null>(null);
  const [hasInk, setHasInk] = React.useState(false);
  const [progress, setProgress] = React.useState<number>();
  const [ocrWarning, setOcrWarning] = React.useState("");
  const [signerType, setSignerType] = React.useState<SignerType>("PATIENT");
  const [relationship, setRelationship] = React.useState("");
  const [authorised, setAuthorised] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { data: stored } = useStoredFile(fileId);

  const clearCanvas = React.useCallback(() => {
    const element = canvas.current;
    element?.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    setHasInk(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setSource("DRAWN");
    setScan(null);
    setOcrWarning("");
    setSignerType("PATIENT");
    setRelationship("");
    setAuthorised(false);
    requestAnimationFrame(clearCanvas);
  }, [open, clearCanvas]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const element = canvas.current!;
    const rect = element.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * element.width,
      y: ((event.clientY - rect.top) / rect.height) * element.height,
    };
  };

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const element = canvas.current!;
    element.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = element.getContext("2d")!;
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvas.current!.getContext("2d")!;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.strokeStyle = "#111827";
    context.lineWidth = 3.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    setHasInk(true);
  };
  const end = () => {
    drawing.current = false;
  };

  const scanFile = async (file?: File) => {
    if (!file) return;
    setProgress(0);
    setScan(null);
    setOcrWarning("");
    let worker:
      | Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
      | undefined;
    try {
      const [upload, tesseract] = await Promise.all([
        extractSignature(file),
        import("tesseract.js"),
      ]);
      worker = await tesseract.createWorker("eng", undefined, {
        langPath: "/api/ocr",
        logger: message => {
          if (message.status === "recognizing text")
            setProgress(Math.round(message.progress * 100));
        },
      });
      const result = await worker.recognize(file);
      const readable = result.data.text.replace(/\s+/g, " ").trim();
      if (readable.length > 18)
        setOcrWarning(
          `OCR found readable text (“${readable.slice(0, 70)}${readable.length > 70 ? "…" : ""}”). Crop or retake this as a signature-only image before saving.`
        );
      setScan(upload);
      toast.success("Signature area extracted", {
        description:
          "Review the preview; OCR does not authenticate handwriting.",
      });
    } catch (error) {
      toast.error(error, "Could not extract the signature");
    } finally {
      await worker?.terminate().catch(() => undefined);
      setProgress(undefined);
      if (input.current) input.current.value = "";
    }
  };

  const save = async () => {
    const upload =
      source === "OCR_SCAN"
        ? scan
        : hasInk && canvas.current
          ? asUpload(
              canvas.current.toDataURL("image/png"),
              "drawn-signature.png"
            )
          : null;
    if (!upload) return;
    await onSave({
      upload,
      source,
      signerType,
      relationship:
        signerType === "ATTENDANT" ? relationship.trim() : undefined,
    });
    onOpenChange(false);
  };

  const ready =
    authorised &&
    (source === "DRAWN" ? hasInk : Boolean(scan) && !ocrWarning) &&
    (signerType === "PATIENT" || Boolean(relationship.trim()));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Patient / attendant signature</DialogTitle>
            <DialogDescription>
              Capture a reusable signature for {name}. OCR only isolates a
              scanned signature; it does not verify identity or handwriting.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {stored ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL */}
                <img
                  src={stored.data}
                  alt="Signature currently on file"
                  className="h-14 w-36 rounded border border-border bg-white object-contain"
                />
                <div className="min-w-0 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Signature on file
                  </p>
                  <p>Replacing it creates a new audited capture event.</p>
                </div>
              </div>
            ) : null}

            <div
              className="flex gap-2"
              role="group"
              aria-label="Signature capture method"
            >
              <Button
                type="button"
                variant={source === "DRAWN" ? "default" : "outline"}
                onClick={() => setSource("DRAWN")}
              >
                <Edit className="size-4" /> Draw
              </Button>
              <Button
                type="button"
                variant={source === "OCR_SCAN" ? "default" : "outline"}
                onClick={() => setSource("OCR_SCAN")}
              >
                <Camera className="size-4" /> Scan & extract
              </Button>
            </div>

            {source === "DRAWN" ? (
              <div>
                <canvas
                  ref={canvas}
                  width={900}
                  height={240}
                  aria-label="Draw signature"
                  className="h-40 w-full touch-none rounded-lg border border-border-strong bg-white"
                  onPointerDown={begin}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={clearCanvas}
                  disabled={!hasInk}
                >
                  Clear drawing
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-5 py-6 hover:border-primary/60"
                  disabled={progress !== undefined}
                  onClick={() => input.current?.click()}
                >
                  <Camera className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {progress === undefined
                      ? "Photograph or choose a signature-only image"
                      : `Reading locally… ${progress}%`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    JPG, PNG or WebP. Processing stays in this application.
                  </span>
                </button>
                <input
                  ref={input}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  onChange={event => void scanFile(event.target.files?.[0])}
                />
                {scan ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated data URL
                  <img
                    src={scan.data}
                    alt="Extracted signature preview"
                    className="mx-auto h-28 max-w-full rounded border border-border bg-white object-contain"
                  />
                ) : null}
                {ocrWarning ? (
                  <p
                    role="alert"
                    className="rounded-md border border-warning/30 bg-warning-surface p-3 text-xs text-warning-foreground"
                  >
                    {ocrWarning}
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">
                Signer
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={signerType}
                  onChange={event =>
                    setSignerType(event.target.value as SignerType)
                  }
                >
                  <option value="PATIENT">Patient</option>
                  <option value="ATTENDANT">Attendant / representative</option>
                </select>
              </label>
              {signerType === "ATTENDANT" ? (
                <label className="space-y-1 text-xs font-medium">
                  Relationship to patient
                  <Input
                    value={relationship}
                    onChange={event => setRelationship(event.target.value)}
                    placeholder="e.g. spouse, parent, guardian"
                  />
                </label>
              ) : null}
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs leading-5">
              <Checkbox
                checked={authorised}
                onCheckedChange={setAuthorised}
                className="mt-0.5"
              />
              <span>
                I confirm the signer authorised this image to be stored and
                optionally reused on patient-facing administrative PDFs. It is
                not a cryptographic digital signature and will not be added to
                clinical reports or consent forms automatically.
              </span>
            </label>
          </DialogBody>
          <DialogFooter className={fileId ? "sm:justify-between" : undefined}>
            {fileId ? (
              <Button
                type="button"
                variant="outline"
                className="text-error-foreground"
                disabled={saving || removing}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="size-4" /> Remove signature
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
                disabled={!ready || saving || progress !== undefined}
                onClick={() => void save().catch(() => undefined)}
              >
                {saving ? "Saving…" : "Save authorised signature"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove stored signature?"
        description={`The reusable signature for ${name} will be removed. Existing exported documents are unchanged.`}
        confirmText="Remove signature"
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

async function extractSignature(file: File): Promise<PreparedUpload> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 40 * 1024 * 1024)
    throw new Error("That image is too large to process (over 40 MB).");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot process the image.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let ink = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance =
        pixels.data[offset]! * 0.299 +
        pixels.data[offset + 1]! * 0.587 +
        pixels.data[offset + 2]! * 0.114;
      if (luminance < 185) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        ink += 1;
      }
    }
  }
  if (ink < 80 || right <= left || bottom <= top)
    throw new Error(
      "No clear dark signature strokes were found. Retake on plain white paper in good light."
    );
  const pad = Math.max(10, Math.round(Math.max(width, height) * 0.02));
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const output = document.createElement("canvas");
  output.width = right - left + 1;
  output.height = bottom - top + 1;
  const out = output.getContext("2d")!;
  out.drawImage(
    source,
    left,
    top,
    output.width,
    output.height,
    0,
    0,
    output.width,
    output.height
  );
  const cleaned = out.getImageData(0, 0, output.width, output.height);
  for (let index = 0; index < cleaned.data.length; index += 4) {
    const luminance =
      cleaned.data[index]! * 0.299 +
      cleaned.data[index + 1]! * 0.587 +
      cleaned.data[index + 2]! * 0.114;
    cleaned.data[index] = 17;
    cleaned.data[index + 1] = 24;
    cleaned.data[index + 2] = 39;
    cleaned.data[index + 3] = Math.max(0, Math.min(255, (225 - luminance) * 3));
  }
  out.putImageData(cleaned, 0, 0);
  return asUpload(output.toDataURL("image/png"), "scanned-signature.png");
}

function asUpload(data: string, name: string): PreparedUpload {
  const base64 = data.slice(data.indexOf(",") + 1);
  return {
    name,
    data,
    mimeType: "image/png",
    sizeKb: Math.max(1, Math.ceil((base64.length * 3) / 4 / 1024)),
  };
}
