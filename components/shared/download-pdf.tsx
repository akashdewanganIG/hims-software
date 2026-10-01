"use client";

import * as React from "react";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { Download } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { downloadPdf } from "@/lib/pdf/layout";
import { toast } from "@/lib/toast";

/** Builds a record's PDF on demand and saves it to the device. */
export function DownloadPdfButton({
  fileName,
  build,
  label = "Download PDF",
  variant = "outline",
  disabled,
}: {
  fileName: string;
  build: () => TDocumentDefinitions | Promise<TDocumentDefinitions>;
  label?: string;
  variant?: "outline" | "default";
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadPdf(fileName, await build());
        } catch (error) {
          toast.error(error, "Could not create the PDF");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="size-4" />
      {busy ? "Preparing PDF…" : label}
    </Button>
  );
}
