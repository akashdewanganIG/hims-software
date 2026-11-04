"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { ArrowLeft, Copy, Printer } from "@/components/icons";
import {
  createDocumentQrDataUrl,
  DocumentQr,
} from "@/components/shared/document-qr";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { buildSharedPdf } from "@/lib/pdf/share";
import { useSession } from "@/lib/session";
import { HOSPITAL } from "@/lib/sim/reference";
import { toast } from "@/lib/toast";

/**
 * Letterhead document for printing (discharge summary, invoice). The action
 * bar and the application chrome are hidden by the print stylesheet; `pdf`
 * adds a download of the same record as a structured PDF.
 */
export function PrintDocument({
  title,
  reference,
  children,
  footer,
  pdf,
  patientSignature,
}: {
  title: string;
  reference: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  pdf?: { fileName: string; build: () => TDocumentDefinitions };
  /** Authorised reusable signature, shown as an administrative acknowledgement. */
  patientSignature?: string;
}) {
  const router = useRouter();
  const { user } = useSession();
  const [publicUrl, setPublicUrl] = React.useState<string>();
  const [qrImage, setQrImage] = React.useState<string>();
  const [sharing, setSharing] = React.useState(false);

  const ensureShare = async () => {
    if (publicUrl) {
      if (!qrImage) setQrImage(await createDocumentQrDataUrl(publicUrl));
      return publicUrl;
    }
    if (!pdf || !user) return undefined;
    const result = await buildSharedPdf(user.id, pdf.fileName, pdf.build);
    if (result.publicUrl) {
      const image = await createDocumentQrDataUrl(result.publicUrl);
      setPublicUrl(result.publicUrl);
      setQrImage(image);
    }
    return result.publicUrl;
  };

  const print = async () => {
    setSharing(true);
    try {
      await ensureShare();
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      window.print();
    } catch (error) {
      toast.error(error, "Could not prepare the printable document");
    } finally {
      setSharing(false);
    }
  };
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-5">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {pdf ? (
            <DownloadPdfButton
              fileName={pdf.fileName}
              build={pdf.build}
              onShared={setPublicUrl}
            />
          ) : null}
          {pdf ? (
            <Button
              variant="outline"
              disabled={sharing}
              onClick={async () => {
                setSharing(true);
                try {
                  const url = await ensureShare();
                  if (!url) {
                    toast.info("Public links require shared database mode.");
                    return;
                  }
                  await navigator.clipboard.writeText(url);
                  toast.success("Public document link copied");
                } catch (error) {
                  toast.error(error, "Could not create the public link");
                } finally {
                  setSharing(false);
                }
              }}
            >
              <Copy className="size-4" />
              {publicUrl ? "Copy public link" : "Create public link"}
            </Button>
          ) : null}
          <Button onClick={() => void print()} disabled={sharing}>
            <Printer className="size-4" />
            {sharing ? "Preparing…" : "Print"}
          </Button>
        </div>
      </div>
      <article className="print-sheet rounded-xl border border-border bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
        <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-4">
          <div className="flex items-start gap-3">
            <LogoPlaceholder tone="print" className="mt-0.5" />
            <div>
              <p className="font-display text-lg font-bold tracking-tight">
                {HOSPITAL.name}
              </p>
              <p className="text-xs text-neutral-600">{HOSPITAL.address}</p>
              <p className="text-xs text-neutral-600">Tel {HOSPITAL.phone}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-base font-semibold uppercase tracking-wide">
              {title}
            </p>
            <p className="font-mono text-xs text-neutral-600">{reference}</p>
          </div>
        </header>
        <div className="mt-5 space-y-5">{children}</div>
        <footer className="mt-10 flex items-end justify-between gap-6 border-t border-neutral-300 pt-4 text-xs text-neutral-600">
          <div className="flex items-end gap-8">
            {patientSignature ? (
              <div className="w-40">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL */}
                <img
                  src={patientSignature}
                  alt="Patient or attendant signature on file"
                  className="h-12 max-w-40 object-contain"
                />
                <p className="border-t border-neutral-400 pt-1 font-medium text-neutral-800">
                  Patient / attendant signature on file
                </p>
                <p className="mt-1 text-[9px]">
                  Authorised reuse; not a cryptographic digital signature.
                </p>
              </div>
            ) : null}
            <div>{footer}</div>
          </div>
          <p>
            Generated {formatDateTime(new Date())} · Demo data — not a medical
            or tax document
          </p>
          {publicUrl ? <DocumentQr value={publicUrl} image={qrImage} /> : null}
        </footer>
      </article>
    </div>
  );
}

export function PrintField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-neutral-900">
        {value || "—"}
      </p>
    </div>
  );
}
