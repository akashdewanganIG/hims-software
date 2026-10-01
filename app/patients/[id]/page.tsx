"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import {
  CalendarCheck,
  Edit,
  Eye,
  FileText,
  HospitalIcon,
  Trash2,
  Upload,
} from "@/components/icons";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { EntityLink, RefCode } from "@/components/shared/entity";
import {
  FileKindIcon,
  FilePreviewDialog,
  PhotoDialog,
  formatFileSize,
} from "@/components/shared/files";
import {
  DetailRow,
  EmptyState,
  ErrorBanner,
  MiniStat,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  StatusBadge,
  Timeline,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Tag } from "@/components/ui/tag";
import {
  AdmittedNotice,
  LabOrderCard,
  PatientBanner,
  PrescriptionCard,
} from "@/features/clinical/components";
import { AdmitDialog } from "@/features/ipd/admit-dialog";
import { BookAppointmentDialog } from "@/features/opd/booking-dialogs";
import { usePatientRecord, type PatientRecord } from "@/features/patients/api";
import { PatientFormDialog } from "@/features/patients/patient-form-dialog";
import {
  EditDocumentDialog,
  UploadDocumentDialog,
} from "@/features/patients/upload-document-dialog";
import { useAction, useStoredFile } from "@/lib/api/client";
import { pdfName } from "@/lib/pdf/layout";
import { patientRecordPdf } from "@/lib/pdf/records";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatINR,
  formatPhone,
  humanize,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Patient } from "@/lib/sim/schema";
import type { PreparedUpload } from "@/lib/uploads";

type Tab =
  | "overview"
  | "encounters"
  | "diagnoses"
  | "medication"
  | "labs"
  | "billing"
  | "documents"
  | "notes";

export default function PatientRecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const { data, isLoading, error } = usePatientRecord(id);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [editOpen, setEditOpen] = React.useState(false);
  const [bookOpen, setBookOpen] = React.useState(false);
  const [admitOpen, setAdmitOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [photoOpen, setPhotoOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { data: photo } = useStoredFile(data?.patient.photoFileId);
  const setPhoto = useAction(
    "patient.setPhoto",
    (upload: PreparedUpload) => ({
      patientId: id,
      photo: { name: upload.name, data: upload.data },
    }),
    { success: "Photo saved" }
  );
  const removePhoto = useAction(
    "patient.removePhoto",
    () => ({ patientId: id }),
    { success: "Photo removed" }
  );
  const remove = useAction("patient.remove", () => ({ patientId: id }), {
    success: p => `Registration ${p.uhid} deleted`,
    onSuccess: () => router.replace("/patients"),
  });

  if (isLoading) {
    return (
      <PageShell>
        <PanelRowsSkeleton rows={2} />
        <PanelRowsSkeleton rows={8} />
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell>
        <ErrorBanner error={error} />
        <EmptyState
          title="Patient not found"
          action={
            <Button asChild variant="outline">
              <Link href="/patients">Back to patient records</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const { patient } = data;
  const option = {
    id: patient.id,
    uhid: patient.uhid,
    name: `${patient.firstName} ${patient.lastName}`,
    phone: patient.phone,
    gender: patient.gender,
    age: patient.age,
  };
  const verifiedLabs = data.labOrders.filter(
    o => o.status === "VERIFIED" || o.status === "RESULT_READY"
  );
  const tabs = [
    { value: "overview" as const, label: "Overview" },
    {
      value: "encounters" as const,
      label: "Encounters",
      count: data.encounters.length,
    },
    {
      value: "diagnoses" as const,
      label: "Diagnoses",
      count: data.diagnoses.length,
    },
    {
      value: "medication" as const,
      label: "Prescriptions",
      count: data.prescriptions.length,
    },
    {
      value: "labs" as const,
      label: "Lab results",
      count: data.labOrders.length,
    },
    { value: "billing" as const, label: "Billing", count: data.bills.length },
    {
      value: "documents" as const,
      label: "Documents",
      count: data.documents.length,
    },
    {
      value: "notes" as const,
      label: "Clinical notes",
      count: data.notes.length,
    },
  ];

  // Documents file against an admission (and its IPD encounter) or an OPD visit.
  const contexts = [
    ...data.admissions.map(a => ({
      value: `adm:${a.id}`,
      label: `Admission ${a.code}`,
      admissionId: a.id,
      encounterId: data.encounters.find(e => e.admissionId === a.id)?.id,
    })),
    ...data.encounters
      .filter(e => e.type === "OPD")
      .slice(0, 10)
      .map(e => ({
        value: `enc:${e.id}`,
        label: `OPD ${e.code} · ${formatDateShort(e.startedAt)}`,
        encounterId: e.id,
      })),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Patient record"
        breadcrumb={[
          { label: "EHR / EMR", href: "/patients" },
          { label: patient.uhid },
        ]}
      />
      <PatientBanner
        patient={patient}
        onPhotoClick={
          can("patient.edit") ? () => setPhotoOpen(true) : undefined
        }
        badges={
          data.activeAdmission ? (
            <StatusBadge status="ADMITTED" label="Admitted" />
          ) : null
        }
        meta={<span>Registered {formatDate(patient.registeredAt)}</span>}
        actions={
          <>
            <DownloadPdfButton
              label="Download record"
              fileName={pdfName("Patient-record", patient.uhid)}
              build={() => patientRecordPdf(data, photo?.data)}
            />
            {can("patient.edit") ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Edit className="size-4" />
                Edit
              </Button>
            ) : null}
            {can("patient.register") && !data.removeBlock ? (
              <Button
                variant="outline"
                className="text-error-foreground"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
            {can("document.upload") ? (
              <Button variant="outline" onClick={() => setUploadOpen(true)}>
                <Upload className="size-4" />
                Upload document
              </Button>
            ) : null}
            {can("ipd.admit") && !data.activeAdmission ? (
              <Button variant="outline" onClick={() => setAdmitOpen(true)}>
                <HospitalIcon className="size-4" />
                Admit
              </Button>
            ) : null}
            {can("appointment.book") ? (
              <Button onClick={() => setBookOpen(true)}>
                <CalendarCheck className="size-4" />
                Book appointment
              </Button>
            ) : null}
          </>
        }
      />
      {data.activeAdmission ? (
        <AdmittedNotice
          admissionId={data.activeAdmission.id}
          label={`Admitted as ${data.activeAdmission.code} · ${data.activeAdmission.bed ?? ""} · ${data.activeAdmission.doctor}`}
        />
      ) : null}

      <section className="grid-auto-fit-sm gap-3" aria-label="Record summary">
        <MiniStat
          label="OPD visits"
          value={data.encounters.filter(e => e.type === "OPD").length}
        />
        <MiniStat label="Admissions" value={data.admissions.length} />
        <MiniStat label="Lab reports" value={verifiedLabs.length} />
        <MiniStat label="Prescriptions" value={data.prescriptions.length} />
        <MiniStat
          label="Outstanding"
          value={formatINR(data.outstanding, true)}
          tone={data.outstanding ? "critical" : "neutral"}
        />
        <MiniStat
          label="Next appointment"
          value={
            data.upcoming[0]
              ? formatDateShort(data.upcoming[0].scheduledAt)
              : "—"
          }
          tone="info"
        />
      </section>

      <div className="flex flex-col gap-3">
        <CategorySwitcher
          label="Record sections"
          items={tabs}
          value={tab}
          onValueChange={setTab}
        />
        {tab === "overview" ? <Overview data={data} /> : null}
        {tab === "encounters" ? <Encounters data={data} /> : null}
        {tab === "diagnoses" ? <Diagnoses data={data} /> : null}
        {tab === "medication" ? (
          <Panel
            title="Prescriptions"
            description="Every prescription with its dispensing status from the pharmacy."
          >
            <div className="space-y-3">
              {data.prescriptions.map(rx => (
                <PrescriptionCard key={rx.id} rx={rx} />
              ))}
              {!data.prescriptions.length ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No prescriptions.
                </p>
              ) : null}
            </div>
          </Panel>
        ) : null}
        {tab === "labs" ? (
          <Panel
            title="Lab results"
            description="Verified reports and preliminary values awaiting verification, newest first."
          >
            <div className="space-y-3">
              {data.labOrders.map(o => (
                <LabOrderCard key={o.id} order={o} />
              ))}
              {!data.labOrders.length ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No lab orders.
                </p>
              ) : null}
            </div>
          </Panel>
        ) : null}
        {tab === "billing" ? <Bills data={data} /> : null}
        {tab === "documents" ? (
          <Documents data={data} canManage={can("document.upload")} />
        ) : null}
        {tab === "notes" ? (
          <Panel
            title="Clinical notes"
            description="OPD consultation notes and inpatient notes."
          >
            <Timeline
              entries={data.notes.map(n => ({
                id: n.id,
                at: n.at,
                title: `${humanize(n.type)} · ${n.author} · ${n.context}`,
                meta: formatDateTime(n.at),
                body: <span className="whitespace-pre-line">{n.text}</span>,
                tone:
                  n.type === "CONSULTATION"
                    ? "info"
                    : n.type === "PROGRESS"
                      ? "info"
                      : "neutral",
              }))}
              empty="No clinical notes."
            />
          </Panel>
        ) : null}
      </div>

      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient as Patient}
      />
      <BookAppointmentDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        initialPatient={option}
      />
      <AdmitDialog
        open={admitOpen}
        onOpenChange={setAdmitOpen}
        prefill={{ patient: option }}
      />
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        patientId={patient.id}
        contexts={contexts}
        defaultContext={
          data.activeAdmission ? `adm:${data.activeAdmission.id}` : undefined
        }
      />
      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this registration?"
        description={`${patient.uhid} has no visits, bills or documents yet, so it can be deleted as registered in error. The UHID is not reused.`}
        confirmText="Delete registration"
        variant="destructive"
        isLoading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      />
      <PhotoDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        name={`${patient.firstName} ${patient.lastName}`}
        fileId={patient.photoFileId}
        onSave={upload => setPhoto.mutateAsync(upload)}
        onRemove={() => removePhoto.mutateAsync()}
        saving={setPhoto.isPending}
        removing={removePhoto.isPending}
      />
    </PageShell>
  );
}

function Overview({ data }: { data: PatientRecord }) {
  const { patient } = data;
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel
        title="Timeline"
        description="Visits, admissions, reports and documents, drawn from every module."
      >
        <Timeline
          entries={data.timeline.slice(0, 30).map(t => ({
            id: t.id,
            at: t.at,
            title: t.href ? (
              <EntityLink href={t.href} className="text-foreground">
                {t.title}
              </EntityLink>
            ) : (
              t.title
            ),
            meta: formatDateTime(t.at),
            body: t.detail ? `${t.kind} · ${t.detail}` : t.kind,
            tone: t.tone,
          }))}
        />
      </Panel>
      <aside className="flex flex-col gap-4">
        <Panel title="Demographics">
          <DetailRow
            label="Date of birth"
            value={`${formatDate(patient.dateOfBirth)} (${patient.age} y)`}
          />
          <DetailRow label="Mobile" value={formatPhone(patient.phone)} />
          {patient.email ? (
            <DetailRow label="Email" value={patient.email} />
          ) : null}
          <DetailRow
            label="Address"
            value={`${patient.address}, ${patient.city}`}
          />
          <DetailRow
            label="Emergency contact"
            value={`${patient.emergencyContactName} · ${formatPhone(patient.emergencyContactPhone)}`}
          />
        </Panel>
        <Panel title="Active problems">
          {data.diagnoses.length ? (
            <ul className="space-y-1.5 text-[0.8125rem]">
              {data.diagnoses.slice(0, 6).map(d => (
                <li
                  key={d.description}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span>
                    {d.description}{" "}
                    {d.code ? <RefCode>{d.code}</RefCode> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateShort(d.lastSeen)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No diagnoses recorded.
            </p>
          )}
        </Panel>
        <Panel title="Upcoming appointments">
          {data.upcoming.length ? (
            <ul className="space-y-2 text-[0.8125rem]">
              {data.upcoming.map(a => (
                <li key={a.id}>
                  <p className="font-medium">{formatDateTime(a.scheduledAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.doctor} · {a.department} ·{" "}
                    <span className="font-mono">{a.code}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None booked.</p>
          )}
        </Panel>
        {data.dischargeSummaries.length ? (
          <Panel title="Discharge summaries">
            <ul className="space-y-2 text-[0.8125rem]">
              {data.dischargeSummaries.map(s => (
                <li
                  key={s.admissionId}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <EntityLink href={`/ipd/${s.admissionId}/summary`}>
                      {s.admissionCode}
                    </EntityLink>
                    <p className="text-xs text-muted-foreground">
                      {s.finalDiagnosis}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}

function Encounters({ data }: { data: PatientRecord }) {
  return (
    <Panel
      flush
      title="Encounters"
      description="OPD visits and inpatient stays, newest first."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="h-10 px-4">Date</th>
              <th className="px-3">Type</th>
              <th className="px-3">Doctor</th>
              <th className="px-3">Complaint / diagnosis</th>
              <th className="px-3">Outcome</th>
              <th className="px-4">Ref</th>
            </tr>
          </thead>
          <tbody>
            {data.encounters.map(e => (
              <tr
                key={e.id}
                className="border-b border-border/80 last:border-0 hover:bg-surface-subtle"
              >
                <td className="px-4 py-2.5 tabular-nums">
                  {formatDateShort(e.startedAt)}
                </td>
                <td className="px-3 py-2.5">
                  <Tag tone={e.type === "IPD" ? "progress" : "neutral"}>
                    {e.type}
                  </Tag>
                </td>
                <td className="px-3 py-2.5">
                  <p>{e.doctor}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.department}
                  </p>
                </td>
                <td className="max-w-80 px-3 py-2.5">
                  <p className="line-clamp-1">
                    {e.diagnoses.map(d => d.description).join("; ") ||
                      e.chiefComplaint}
                  </p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {e.chiefComplaint}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  {e.status === "OPEN" ? (
                    <StatusBadge status="OPEN_VISIT" label="Open" />
                  ) : e.disposition ? (
                    humanize(e.disposition)
                  ) : (
                    "Discharged"
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <EntityLink href={e.href} className="font-mono text-xs">
                    {e.code}
                  </EntityLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Diagnoses({ data }: { data: PatientRecord }) {
  return (
    <Panel
      flush
      title="Diagnoses"
      description="Every diagnosis recorded across encounters, with when it was last documented."
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="h-10 px-4">Diagnosis</th>
            <th className="px-3">ICD-10</th>
            <th className="px-3 text-right">Times recorded</th>
            <th className="px-3">Last recorded</th>
            <th className="px-4">Source</th>
          </tr>
        </thead>
        <tbody>
          {data.diagnoses.map(d => (
            <tr
              key={d.description}
              className="border-b border-border/80 last:border-0"
            >
              <td className="px-4 py-2.5 font-medium">{d.description}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{d.code ?? "—"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{d.count}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {formatDate(d.lastSeen)}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{d.source}</td>
            </tr>
          ))}
          {!data.diagnoses.length ? (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                No diagnoses yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Panel>
  );
}

function Bills({ data }: { data: PatientRecord }) {
  return (
    <Panel
      flush
      title="Billing"
      description="All bills raised for this patient."
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="h-10 px-4">Bill</th>
            <th className="px-3">Date</th>
            <th className="px-3">For</th>
            <th className="px-3 text-right">Total</th>
            <th className="px-3 text-right">Paid</th>
            <th className="px-3 text-right">Balance</th>
            <th className="px-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.bills.map(b => (
            <tr key={b.id} className="border-b border-border/80 last:border-0">
              <td className="px-4 py-2.5">
                <EntityLink
                  href={`/billing/${b.id}`}
                  module="billing"
                  className="font-mono text-xs"
                >
                  {b.code}
                </EntityLink>
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                {formatDateShort(b.createdAt)}
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                {b.context}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatINR(b.total)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatINR(b.paid)}
              </td>
              <td
                className={
                  b.balance
                    ? "px-3 py-2.5 text-right font-semibold tabular-nums text-error-foreground"
                    : "px-3 py-2.5 text-right tabular-nums text-muted-foreground"
                }
              >
                {formatINR(b.balance)}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge
                  status={b.status}
                  label={b.status === "DRAFT" ? "Running" : undefined}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

type RecordDocument = PatientRecord["documents"][number];

function Documents({
  data,
  canManage,
}: {
  data: PatientRecord;
  canManage: boolean;
}) {
  const [viewing, setViewing] = React.useState<RecordDocument | null>(null);
  const [removing, setRemoving] = React.useState<RecordDocument | null>(null);
  const [editing, setEditing] = React.useState<RecordDocument | null>(null);
  const remove = useAction(
    "document.remove",
    () => ({ documentId: removing!.id }),
    { success: "Document removed", onSuccess: () => setRemoving(null) }
  );
  return (
    <Panel
      flush
      title="Documents"
      description="Uploaded scans and reports, consent forms and discharge summaries. MRD case files are listed below."
    >
      {data.documents.length ? (
        <ul className="divide-y divide-border">
          {data.documents.map(d => (
            <li
              key={d.id}
              className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                {d.file ? (
                  <FileKindIcon mimeType={d.file.mimeType} />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                    <FileText className="size-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-medium">
                    {d.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {humanize(d.kind)} · {d.fileName} ·{" "}
                    {formatFileSize(d.sizeKb)} · {d.uploadedBy} ·{" "}
                    {formatDateShort(d.uploadedAt)}
                    {d.context ? ` · ${d.context}` : ""}
                    {!d.file && !d.href ? " · paper original" : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {d.file ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewing(d)}
                    aria-label={`View ${d.title}`}
                  >
                    <Eye className="size-4" />
                    View
                  </Button>
                ) : d.href ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={d.href}>
                      <Eye className="size-4" />
                      Open
                    </Link>
                  </Button>
                ) : null}
                {canManage && !d.changeBlock ? (
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
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No documents.
        </p>
      )}
      <FilePreviewDialog
        file={viewing?.file ?? null}
        title={viewing?.title}
        onOpenChange={open => !open && setViewing(null)}
      />
      <EditDocumentDialog document={editing} onClose={() => setEditing(null)} />
      <ConfirmationDialog
        open={Boolean(removing)}
        onOpenChange={open => !open && setRemoving(null)}
        title="Remove document?"
        description={`"${removing?.title ?? ""}" and its file will be removed from the patient record. The removal is kept in the audit trail.`}
        confirmText="Remove document"
        variant="destructive"
        isLoading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      />
      <div className="border-t border-border px-4 py-3">
        <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Medical record files
        </p>
        <div className="flex flex-wrap gap-2">
          {data.medicalRecords.map(r => (
            <EntityLink
              key={r.id}
              href={`/mrd?open=${r.id}`}
              module="mrd"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-normal text-foreground"
            >
              <span className="font-mono text-xs">{r.code}</span>
              <span className="text-xs text-muted-foreground">{r.context}</span>
              <StatusBadge status={r.status} />
            </EntityLink>
          ))}
          {!data.medicalRecords.length ? (
            <span className="text-xs text-muted-foreground">None yet.</span>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
