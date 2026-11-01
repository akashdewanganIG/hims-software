"use client";

import * as React from "react";

import { Camera } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

export function OcrScanButton({
  onRecognized,
  onFile,
  label = "Scan & fill",
  disabled,
}: {
  onRecognized: (text: string) => void;
  onFile?: (file: File) => void | Promise<void>;
  label?: string;
  disabled?: boolean;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<number>();

  const scan = async (file: File | undefined) => {
    if (!file) return;
    setProgress(0);
    let worker:
      | Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
      | undefined;
    try {
      await onFile?.(file);
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", undefined, {
        langPath: "/api/ocr",
        logger: message => {
          if (message.status === "recognizing text")
            setProgress(Math.round(message.progress * 100));
        },
      });
      const result = await worker.recognize(file);
      const text = result.data.text.trim();
      if (!text) throw new Error("No readable text was found in the scan.");
      onRecognized(text);
      toast.success("Scan read successfully", {
        description: "Review the filled fields before saving.",
      });
    } catch (error) {
      toast.error(error, "Could not read the scan");
    } finally {
      await worker?.terminate().catch(() => undefined);
      setProgress(undefined);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || progress !== undefined}
        onClick={() => input.current?.click()}
      >
        <Camera className="size-4" />
        {progress === undefined ? label : `Reading… ${progress}%`}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label={label}
        onChange={event => void scan(event.target.files?.[0])}
      />
    </>
  );
}
