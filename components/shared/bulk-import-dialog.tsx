"use client";

import * as React from "react";

import { Download, Upload } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/lib/toast";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 500;

export interface ImportField {
  key: string;
  label: string;
  example: string | number | boolean;
  required?: boolean;
  aliases?: string[];
}

type ImportRow = {
  number: number;
  values: Record<string, string>;
  errors: string[];
};

type ImportResult = {
  row: ImportRow;
  ok: boolean;
  error?: string;
};

export function BulkImportDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  validate,
  importRow,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fields: ImportField[];
  validate?: (values: Record<string, string>) => string[];
  importRow: (values: Record<string, string>) => Promise<unknown>;
  onComplete?: () => void | Promise<void>;
}) {
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<ImportRow[]>([]);
  const [results, setResults] = React.useState<ImportResult[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = () => {
    setFileName("");
    setRows([]);
    setResults(null);
    setBusy(false);
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const takeFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setResults(null);
    try {
      if (file.size > MAX_BYTES)
        throw new Error("Import files can be up to 10 MB.");
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: false,
      });
      const sheet = book.Sheets[book.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("The workbook has no readable worksheet.");
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      if (matrix.length < 2)
        throw new Error("Add at least one data row below the headers.");
      if (matrix.length - 1 > MAX_ROWS)
        throw new Error(`Import at most ${MAX_ROWS} rows at a time.`);

      const headers = matrix[0]!.map(normaliseHeader);
      const parsed = matrix.slice(1).map((cells, index) => {
        const values: Record<string, string> = {};
        for (const field of fields) {
          const accepted = [
            field.key,
            field.label,
            ...(field.aliases ?? []),
          ].map(normaliseHeader);
          const column = headers.findIndex(header => accepted.includes(header));
          values[field.key] =
            column >= 0 ? String(cells[column] ?? "").trim() : "";
        }
        const missing = fields
          .filter(field => field.required && !values[field.key])
          .map(field => `${field.label} is required.`);
        return {
          number: index + 2,
          values,
          errors: [...missing, ...(validate?.(values) ?? [])],
        };
      });
      setFileName(file.name);
      setRows(parsed);
    } catch (error) {
      setRows([]);
      toast.error(error, "Could not read the import file");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sample = Object.fromEntries(
      fields.map(field => [field.label, field.example])
    );
    const sheet = XLSX.utils.json_to_sheet([sample], {
      header: fields.map(field => field.label),
    });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Import template");
    XLSX.writeFile(book, `${normaliseFileName(title)}-template.xlsx`, {
      compression: true,
    });
  };

  const runImport = async () => {
    const valid = rows.filter(row => row.errors.length === 0);
    if (!valid.length) return;
    setBusy(true);
    const next: ImportResult[] = rows
      .filter(row => row.errors.length > 0)
      .map(row => ({ row, ok: false, error: row.errors.join(" ") }));
    for (const row of valid) {
      try {
        await importRow(row.values);
        next.push({ row, ok: true });
      } catch (error) {
        next.push({
          row,
          ok: false,
          error: error instanceof Error ? error.message : "Import failed.",
        });
      }
    }
    next.sort((a, b) => a.row.number - b.row.number);
    setResults(next);
    setBusy(false);
    await onComplete?.();
    const imported = next.filter(result => result.ok).length;
    if (imported)
      toast.success(`Imported ${imported} ${imported === 1 ? "row" : "rows"}.`);
  };

  const downloadFailures = async () => {
    if (!failures.length) return;
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(
      failures.map(result => ({
        ...Object.fromEntries(
          fields.map(field => [field.label, result.row.values[field.key] ?? ""])
        ),
        "Import error": result.error ?? "Import failed.",
      }))
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Rows not imported");
    XLSX.writeFile(book, `${normaliseFileName(title)}-not-imported.xlsx`, {
      compression: true,
    });
  };

  const failures = results?.filter(result => !result.ok) ?? [];
  const validCount = rows.filter(row => row.errors.length === 0).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!results ? (
            <>
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    1. Start from the template
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Keep the header row. XLSX and CSV files are accepted; up to{" "}
                    {MAX_ROWS} rows.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void downloadTemplate()}
                >
                  <Download className="size-4" />
                  Download template
                </Button>
              </div>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-5 py-8 text-center hover:border-primary/60">
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {busy
                    ? "Reading file…"
                    : fileName || "Choose an XLSX or CSV file"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Nothing is uploaded until you review and confirm the valid
                  rows.
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv"
                  className="sr-only"
                  disabled={busy}
                  onChange={event => void takeFile(event.target.files?.[0])}
                />
              </label>
              {rows.length ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      2. Review before importing
                    </p>
                    <Tag tone="active">{validCount} ready</Tag>
                    {rows.length - validCount ? (
                      <Tag tone="danger">
                        {rows.length - validCount} need attention
                      </Tag>
                    ) : null}
                  </div>
                  <div className="max-h-80 overflow-auto rounded-lg border border-border">
                    <table className="w-full min-w-[44rem] text-xs">
                      <thead className="sticky top-0 bg-surface-subtle text-left">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          {fields.slice(0, 5).map(field => (
                            <th key={field.key} className="px-3 py-2">
                              {field.label}
                            </th>
                          ))}
                          <th className="px-3 py-2">Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => (
                          <tr
                            key={row.number}
                            className="border-t border-border align-top"
                          >
                            <td className="px-3 py-2 tabular-nums">
                              {row.number}
                            </td>
                            {fields.slice(0, 5).map(field => (
                              <td
                                key={field.key}
                                className="max-w-44 truncate px-3 py-2"
                              >
                                {row.values[field.key] || "—"}
                              </td>
                            ))}
                            <td className="px-3 py-2">
                              {row.errors.length ? (
                                <span className="text-error-foreground">
                                  {row.errors.join(" ")}
                                </span>
                              ) : (
                                <span className="text-success-foreground">
                                  Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <ResultCard
                  label="Imported"
                  value={results.filter(result => result.ok).length}
                  tone="success"
                />
                <ResultCard
                  label="Skipped"
                  value={failures.length}
                  tone={failures.length ? "danger" : "neutral"}
                />
                <ResultCard
                  label="Total rows"
                  value={results.length}
                  tone="neutral"
                />
              </div>
              {failures.length ? (
                <div className="rounded-lg border border-error/30 bg-error-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-error-foreground">
                      Rows not imported
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void downloadFailures()}
                    >
                      <Download className="size-4" />
                      Download error workbook
                    </Button>
                  </div>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs text-error-foreground">
                    {failures.map(result => (
                      <li key={result.row.number}>
                        Row {result.row.number}: {result.error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="rounded-lg border border-success/30 bg-success-surface p-4 text-sm text-success-foreground">
                  Every row was imported successfully.
                </p>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => close(false)}
            disabled={busy}
          >
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && rows.length ? (
            <Button
              type="button"
              onClick={() => void runImport()}
              disabled={busy || validCount === 0}
            >
              <Upload className="size-4" />
              {busy
                ? "Importing…"
                : `Import ${validCount} valid ${validCount === 1 ? "row" : "rows"}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "neutral";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${tone === "success" ? "border-success/30 bg-success-surface" : tone === "danger" ? "border-error/30 bg-error-surface" : "border-border bg-surface-subtle"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const normaliseHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const normaliseFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
