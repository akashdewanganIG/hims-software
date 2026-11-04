"use client";

import * as React from "react";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { Download } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildSharedPdf } from "@/lib/pdf/share";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { downloadDataUrl } from "@/lib/uploads";

type PdfBuilder = () => TDocumentDefinitions | Promise<TDocumentDefinitions>;

/** Builds a record's PDF on demand and saves it to the device. */
export function DownloadPdfButton({
  fileName,
  build,
  label = "Download PDF",
  variant = "outline",
  disabled,
  onShared,
  buildWithoutPatientSignature,
}: {
  fileName: string;
  build: PdfBuilder;
  label?: string;
  variant?: "outline" | "default";
  disabled?: boolean;
  onShared?: (publicUrl: string) => void;
  /** Lets the user explicitly choose whether to reuse the signature on file. */
  buildWithoutPatientSignature?: PdfBuilder;
}) {
  const [busy, setBusy] = React.useState(false);
  const { user } = useSession();

  const download = async (chosenBuild: PdfBuilder) => {
    setBusy(true);
    try {
      if (!user) throw new Error("Sign in to download this document.");
      const result = await buildSharedPdf(user.id, fileName, chosenBuild);
      downloadDataUrl(fileName, result.data);
      if (result.publicUrl) onShared?.(result.publicUrl);
    } catch (error) {
      toast.error(error, "Could not create the PDF");
    } finally {
      setBusy(false);
    }
  };

  const button = (
    <Button type="button" variant={variant} disabled={disabled || busy}>
      <Download className="size-4" />
      {busy ? "Preparing PDF…" : label}
    </Button>
  );
  if (!buildWithoutPatientSignature)
    return React.cloneElement(button, { onClick: () => void download(build) });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Patient signature on file</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void download(build)}>
          Include authorised signature
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void download(buildWithoutPatientSignature)}
        >
          Download without signature
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
