"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { ArrowLeft, Printer } from "@/components/icons";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { HOSPITAL } from "@/lib/sim/reference";

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
}: {
  title: string;
  reference: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  pdf?: { fileName: string; build: () => TDocumentDefinitions };
}) {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-5">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {pdf ? (
            <DownloadPdfButton fileName={pdf.fileName} build={pdf.build} />
          ) : null}
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
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
          <div>{footer}</div>
          <p>
            Generated {formatDateTime(new Date())} · Simulation — not a medical
            or tax document
          </p>
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
