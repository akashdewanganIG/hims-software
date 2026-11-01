"use client";

import * as React from "react";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { Download } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { buildSharedPdf } from "@/lib/pdf/share";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { downloadDataUrl } from "@/lib/uploads";

/** Builds a record's PDF on demand and saves it to the device. */
export function DownloadPdfButton({
  fileName,
  build,
  label = "Download PDF",
  variant = "outline",
  disabled,
  onShared,
}: {
  fileName: string;
  build: () => TDocumentDefinitions | Promise<TDocumentDefinitions>;
  label?: string;
  variant?: "outline" | "default";
  disabled?: boolean;
  onShared?: (publicUrl: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const { user } = useSession();
  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (!user) throw new Error("Sign in to download this document.");
          const result = await buildSharedPdf(user.id, fileName, build);
          downloadDataUrl(fileName, result.data);
          if (result.publicUrl) onShared?.(result.publicUrl);
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
