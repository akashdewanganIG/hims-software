"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  Archive,
  CheckCheck,
  Edit,
  Eye,
  FolderOpen,
  Hourglass,
  Trash2,
  Upload,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { EntityLink, PatientCell, RefCode } from "@/components/shared/entity";
import { FilePreviewDialog } from "@/components/shared/files";
import {
  DetailGrid,
  DetailRow,
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
  StatusBadge,
  Timeline,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SearchInput } from "@/components/ui/search-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMedicalRecord,
  useMedicalRecords,
  useMrdSummary,
  type MrdDetail,
  type MrdRow,
  type MrdView,
} from "@/features/mrd/api";
import {
  EditDocumentDialog,
  UploadDocumentDialog,
} from "@/features/patients/upload-document-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { ROOT_KEY, useAction } from "@/lib/api/client";
import { formatDateShort, formatDateTime, humanize } from "@/lib/format";
import { pdfName } from "@/lib/pdf/layout";
import { caseFilePdf } from "@/lib/pdf/records";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default function MrdPage() {
  return (
    <React.Suspense>
      <Mrd />
    </React.Suspense>
  );
}

function Mrd() {
  const params = useSearchParams();
  const [view, setView] = React.useState<MrdView>(
    params.get("open") ? "all" : "review"
  );
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));
  const {
    data: rows = [],
    isLoading,
    error,
  } = useMedicalRecords({ view, q: q || undefined, type: type || undefined });
  const { data: summary } = useMrdSummary();
  const completion = summary?.total
    ? Math.round(((summary.complete + summary.archived) / summary.total) * 100)
    : 0;

  const columns: Column<MrdRow>[] = [
    {
      id: "code",
      header: "Record",
      sortValue: r => r.code,
      cell: r => <RefCode className="text-foreground">{r.code}</RefCode>,
    },
    {
      id: "patient",
      header: "Patient",
      sortValue: r => r.patient.name,
      cell: r => <PatientCell patient={r.patient} />,
    },
    {
      id: "type",
      header: "Type",
      sortValue: r => r.type,
      cell: r => (
        <div>
          <p>
            {r.type === "IPD_CASE_FILE" ? "IPD case file" : "OPD case sheet"}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {r.encounterCode}
          </p>
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      sortValue: r => r.department,
      cell: r => (
        <div className="min-w-0">
          <p className="truncate">{r.department}</p>
          <p className="truncate text-xs text-muted-foreground">{r.doctor}</p>
        </div>
      ),
    },
    {
      id: "created",
      header: "Opened",
      sortValue: r => r.createdAt,
      cell: r => (
        <span className="tabular-nums">{formatDateShort(r.createdAt)}</span>
      ),
    },
    {
      id: "checklist",
      header: "Completeness",
      sortValue: r => r.checklistDone / r.checklistTotal,
      cell: r => (
        <div className="w-40">
          <Progress
            value={r.checklistDone}
            max={r.checklistTotal}
            className="h-1.5"
          />
          <p
            className={cn(
              "mt-1 truncate text-xs",
              r.missing.length
                ? "text-warning-foreground"
                : "text-muted-foreground"
            )}
            title={r.missing.join(", ")}
          >
            {r.missing.length
              ? `Missing: ${r.missing.join(", ")}`
              : `${r.checklistDone}/${r.checklistTotal} complete`}
          </p>
        </div>
      ),
    },
    {
      id: "location",
      header: "Location",
      defaultHidden: view !== "archived",
      cell: r => r.location ?? "—",
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Medical records"
        subtitle="Case sheets and IPD case files. Completeness is checked against the clinical record itself; complete files are reviewed and archived."
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Pending review"
          value={summary?.review ?? 0}
          icon={Hourglass}
          loading={!summary}
          tone={summary?.review ? "info" : "neutral"}
        />
        <StatCard
          label="Incomplete"
          value={summary?.incomplete ?? 0}
          icon={FolderOpen}
          loading={!summary}
          tone={summary?.dischargedIncomplete ? "warning" : "neutral"}
          hint={`${summary?.dischargedIncomplete ?? 0} discharged files incomplete`}
        />
        <StatCard
          label="Reviewed · 7 d"
          value={summary?.reviewedThisWeek ?? 0}
          icon={CheckCheck}
          loading={!summary}
          tone="positive"
        />
        <StatCard
          label="Archived"
          value={summary?.archived ?? 0}
          icon={Archive}
          loading={!summary}
          hint={`${completion}% of all files complete`}
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{
            id: "created",
            direction:
              view === "review" || view === "incomplete" ? "asc" : "desc",
          }}
          empty="No records in this view."
          onRowClick={r => setOpenId(r.id)}
          toolbar={
            <>
              <CategorySwitcher
                label="Record status"
                value={view}
                onValueChange={setView}
                items={[
                  {
                    value: "review",
                    label: "Pending review",
                    count: summary?.review,
                  },
                  {
                    value: "incomplete",
                    label: "Incomplete",
                    count: summary?.incomplete,
                  },
                  {
                    value: "complete",
                    label: "Complete",
                    count: summary?.complete,
                  },
                  { value: "archived", label: "Archived" },
                  { value: "all", label: "All" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Patient, UHID, MR, OPD or ADM number"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-44"
                aria-label="Record type"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="">All types</option>
                <option value="OPD_CASE_SHEET">OPD case sheets</option>
                <option value="IPD_CASE_FILE">IPD case files</option>
              </SelectField>
            </>
          }
        />
      </Panel>
      <RecordSheet id={openId} onClose={() => setOpenId(null)} />
    </PageShell>
  );
}

function RecordSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { can, staff } = useSession();
  const { data } = useMedicalRecord(id);
  const [dialog, setDialog] = React.useState<
    null | "return" | "archive" | "upload"
  >(null);
  const [text, setText] = React.useState("");
  const [viewing, setViewing] = React.useState<MrdDocument | null>(null);
  const [removing, setRemoving] = React.useState<MrdDocument | null>(null);
  const [editing, setEditing] = React.useState<MrdDocument | null>(null);
  const manage = can("mrd.manage");
  const removeDocument = useAction(
    "document.remove",
    () => ({ documentId: removing!.id }),
    { success: "Document removed", onSuccess: () => setRemoving(null) }
  );

  // Opening a record is audited once per open (Strict Mode mounts effects twice).
  const queryClient = useQueryClient();
  const logged = React.useRef<string | null>(null);
  const { mutate: logView } = useAction(
    "mrd.logView",
    (recordId: string) => ({ recordId }),
    {
      silent: true,
      onSuccess: () =>
        void queryClient.invalidateQueries({
          queryKey: [ROOT_KEY, "view", "mrd.record"],
        }),
    }
  );
  React.useEffect(() => {
    if (!id || !staff || logged.current === id) return;
    logged.current = id;
    logView(id);
  }, [id, staff, logView]);
  React.useEffect(() => {
    if (!id) logged.current = null;
  }, [id]);

  const review = useAction("mrd.review", () => ({ recordId: id! }), {
    success: "Record reviewed and marked complete",
  });
  const giveBack = useAction(
    "mrd.return",
    (note: string) => ({ recordId: id!, note }),
    {
      success: "Record returned to the department",
      onSuccess: () => setDialog(null),
    }
  );
  const archive = useAction(
    "mrd.archive",
    (location: string) => ({ recordId: id!, location }),
    { success: "Record archived", onSuccess: () => setDialog(null) }
  );
  const resubmit = useAction("mrd.resubmit", () => ({ recordId: id! }), {
    success: "Record resubmitted for review",
  });

  const rec = data?.record;
  return (
    <>
      <Sheet open={Boolean(id)} onOpenChange={open => !open && onClose()}>
        <SheetContent size="lg">
          {!data || !rec ? (
            <SheetBody className="space-y-3">
              <SheetTitle className="sr-only">Loading record</SheetTitle>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-40 w-full" />
            </SheetBody>
          ) : (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>{rec.code}</SheetTitle>
                  <StatusBadge status={rec.status} />
                </div>
                <SheetDescription>
                  {rec.recordType === "IPD_CASE_FILE"
                    ? "IPD case file"
                    : "OPD case sheet"}{" "}
                  · {data.patient.name} · {data.patient.uhid}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <DetailGrid columns={2}>
                  <DetailRow
                    label="Patient"
                    value={
                      <EntityLink
                        href={`/patients/${data.patient.id}`}
                        module="ehr"
                      >
                        {data.patient.name}
                      </EntityLink>
                    }
                  />
                  <DetailRow
                    label={data.admission ? "Admission" : "Visit"}
                    value={
                      data.admission ? (
                        <EntityLink
                          href={`/ipd/${data.admission.id}`}
                          module="ipd"
                        >
                          {data.admission.code}
                        </EntityLink>
                      ) : (
                        <EntityLink
                          href={`/opd/visits/${data.encounter.id}`}
                          module="opd"
                        >
                          {data.encounter.code}
                        </EntityLink>
                      )
                    }
                  />
                  <DetailRow label="Department" value={data.department} />
                  <DetailRow label="Attending doctor" value={data.doctor} />
                  <DetailRow
                    label="Period"
                    value={
                      data.admission
                        ? `${formatDateShort(data.admission.admittedAt)} – ${data.admission.dischargedAt ? formatDateShort(data.admission.dischargedAt) : "in-house"}`
                        : formatDateTime(data.encounter.startedAt)
                    }
                  />
                  <DetailRow
                    label="Diagnosis"
                    value={data.encounter.diagnoses.join("; ")}
                  />
                  {rec.reviewedAt ? (
                    <DetailRow
                      label="Reviewed"
                      value={`${formatDateTime(rec.reviewedAt)} · ${data.reviewedBy}`}
                    />
                  ) : null}
                  {rec.location ? (
                    <DetailRow label="Shelf location" value={rec.location} />
                  ) : null}
                </DetailGrid>
                {rec.reviewNote ? (
                  <DetailRow label="Review note" value={rec.reviewNote} />
                ) : null}

                <div>
                  <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Completeness checklist
                  </p>
                  <ul className="divide-y divide-border-subtle rounded-lg border border-border">
                    {data.checklist.map(item => (
                      <li
                        key={item.key}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-[0.8125rem]"
                      >
                        <span
                          className={item.done ? "" : "text-muted-foreground"}
                        >
                          {item.label}
                        </span>
                        <StatusBadge
                          status={item.done ? "COMPLETE" : "PENDING"}
                          label={item.done ? "Done" : "Missing"}
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Checked live against the clinical record. A record moves to
                    review automatically once every item is done.
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Documents
                  </p>
                  {data.documents.length ? (
                    <ul className="space-y-1 text-[0.8125rem]">
                      {data.documents.map(d => (
                        <li
                          key={d.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0 truncate">
                            {d.kind === "DISCHARGE_SUMMARY" &&
                            data.admission ? (
                              <EntityLink
                                href={`/ipd/${data.admission.id}/summary`}
                              >
                                {d.title}
                              </EntityLink>
                            ) : (
                              d.title
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            {humanize(d.kind)} · {formatDateShort(d.uploadedAt)}
                            {d.file ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`View ${d.title}`}
                                onClick={() => setViewing(d)}
                              >
                                <Eye className="size-4" />
                              </Button>
                            ) : null}
                            {can("document.upload") && !d.changeBlock ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Edit ${d.title}`}
                                  onClick={() => setEditing(d)}
                                >
                                  <Edit className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove ${d.title}`}
                                  onClick={() => setRemoving(d)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No documents filed.
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Access history
                  </p>
                  <Timeline
                    entries={data.access.map(a => ({
                      id: a.id,
                      at: a.at,
                      title: `${humanize(a.action)} · ${a.by}`,
                      meta: formatDateTime(a.at),
                      body: a.note,
                      tone:
                        a.action === "RETURNED"
                          ? "warning"
                          : a.action === "REVIEWED" || a.action === "ARCHIVED"
                            ? "success"
                            : "neutral",
                    }))}
                    empty="No access recorded."
                  />
                </div>
              </SheetBody>
              <SheetFooter>
                <div className="flex flex-col gap-2 sm:mr-auto sm:flex-row">
                  <DownloadPdfButton
                    fileName={pdfName("Case-file", rec.code)}
                    build={() => caseFilePdf(data)}
                  />
                  {can("document.upload") && rec.status !== "ARCHIVED" ? (
                    <Button
                      variant="outline"
                      onClick={() => setDialog("upload")}
                    >
                      <Upload className="size-4" />
                      Upload document
                    </Button>
                  ) : null}
                </div>
                {manage &&
                rec.status === "INCOMPLETE" &&
                data.checklist.every(c => c.done) ? (
                  <Button onClick={() => resubmit.mutate()}>
                    Submit for review
                  </Button>
                ) : null}
                {manage && rec.status === "PENDING_REVIEW" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setText("");
                        setDialog("return");
                      }}
                    >
                      Return for correction
                    </Button>
                    <Button
                      onClick={() => review.mutate()}
                      disabled={review.isPending}
                    >
                      Mark complete
                    </Button>
                  </>
                ) : null}
                {manage && rec.status === "COMPLETE" ? (
                  <Button
                    onClick={() => {
                      setText("");
                      setDialog("archive");
                    }}
                  >
                    <Archive className="size-4" />
                    Archive
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <FormDialog
        open={dialog === "return" || dialog === "archive"}
        onOpenChange={open => !open && setDialog(null)}
        title={
          dialog === "archive" ? "Archive record" : "Return for correction"
        }
        description={
          dialog === "archive"
            ? "Record the physical shelf location of the file."
            : "Tell the department what needs correcting."
        }
        size="sm"
        submitLabel={dialog === "archive" ? "Archive" : "Return"}
        submitDisabled={!text.trim()}
        onSubmit={event => {
          event.preventDefault();
          if (dialog === "archive") archive.mutate(text);
          else giveBack.mutate(text);
        }}
      >
        <Field label={dialog === "archive" ? "Location" : "Note"} required>
          <Input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              dialog === "archive"
                ? "e.g. Rack C · Shelf 4"
                : "e.g. Consultant signature missing"
            }
          />
        </Field>
      </FormDialog>
      <EditDocumentDialog document={editing} onClose={() => setEditing(null)} />
      {data ? (
        <UploadDocumentDialog
          open={dialog === "upload"}
          onOpenChange={open => !open && setDialog(null)}
          patientId={data.patient.id}
          contexts={[
            {
              value: "this",
              label: data.admission
                ? `Admission ${data.admission.code}`
                : `Visit ${data.encounter.code}`,
              encounterId: data.encounter.id,
              admissionId: data.admission?.id,
            },
          ]}
          defaultContext="this"
        />
      ) : null}
      <FilePreviewDialog
        file={viewing?.file ?? null}
        title={viewing?.title}
        onOpenChange={open => !open && setViewing(null)}
      />
      <ConfirmationDialog
        open={Boolean(removing)}
        onOpenChange={open => !open && setRemoving(null)}
        title="Remove document?"
        description={`"${removing?.title ?? ""}" and its file will be removed from this case file. The removal is kept in the record's access log.`}
        confirmText="Remove document"
        variant="destructive"
        isLoading={removeDocument.isPending}
        onConfirm={async () => {
          await removeDocument.mutateAsync();
        }}
      />
    </>
  );
}

type MrdDocument = MrdDetail["documents"][number];
