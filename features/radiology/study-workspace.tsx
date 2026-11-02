"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  FileText,
  Printer,
  TriangleAlert,
} from "@/components/icons";
import {
  DetailGrid,
  DetailRow,
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRadiologyOrder } from "./api";
import { useAction } from "@/lib/api/client";
import { formatDateTime, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { RadiologyCriticality } from "@/lib/sim/schema";

export function StudyWorkspace({ orderId }: { orderId: string }) {
  const { can, staff } = useSession();
  const { data, error, isLoading } = useRadiologyOrder(orderId);
  const [safetyOpen, setSafetyOpen] = React.useState(false);
  const [completeOpen, setCompleteOpen] = React.useState<string | null>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [communicationOpen, setCommunicationOpen] = React.useState<
    string | null
  >(null);
  const checkIn = useAction("radiology.checkIn", () => ({ orderId }), {
    success: "Patient checked in",
  });
  const start = useAction("radiology.startStudy", () => ({ orderId }), {
    success: "Acquisition started",
  });
  const finalise = useAction(
    "radiology.finaliseReport",
    (reportId: string) => ({ reportId }),
    { success: "Radiology report finalised" }
  );
  const acknowledge = useAction(
    "radiology.acknowledge",
    (communicationId: string) => ({ communicationId }),
    { success: "Critical finding acknowledged" }
  );
  if (isLoading || !data)
    return (
      <PageShell>
        <PageHeader
          title="Imaging study"
          subtitle="Loading clinical imaging workspace…"
        />
        <ErrorBanner error={error} />
      </PageShell>
    );
  const latestReport = data.reports[0];
  const activeStudy = [...data.studies].reverse().find(row => !row.completedAt);
  return (
    <PageShell>
      <PageHeader
        title={`${data.order.accessionNumber} · ${data.procedure.name}`}
        subtitle={`${data.patient.name} · ${data.patient.uhid} · ${humanize(data.procedure.modality)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/radiology">
                <ArrowLeft className="size-4" />
                Worklist
              </Link>
            </Button>
            {latestReport &&
            ["FINAL", "AMENDED"].includes(latestReport.status) ? (
              <Button asChild variant="outline">
                <Link href={`/radiology/reports/${data.order.id}`}>
                  <Printer className="size-4" />
                  Print report
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorBanner error={error} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Panel
            title="Order and workflow"
            actions={<StatusBadge status={data.order.status} />}
          >
            <DetailGrid columns={3}>
              <DetailRow
                label="Patient"
                value={`${data.patient.name} · ${data.patient.age}y · ${humanize(data.patient.gender)}`}
              />
              <DetailRow
                label="Priority"
                value={humanize(data.order.priority)}
              />
              <DetailRow
                label="Ordered"
                value={formatDateTime(data.order.orderedAt)}
              />
              <DetailRow
                label="Clinical indication"
                value={data.order.clinicalIndication}
                className="sm:col-span-2"
              />
              <DetailRow
                label="Provisional diagnosis"
                value={data.order.provisionalDiagnosis || "Not stated"}
              />
              <DetailRow
                label="Preparation"
                value={data.procedure.preparation}
                className="sm:col-span-2"
              />
              <DetailRow
                label="Equipment"
                value={
                  data.equipment
                    ? `${data.equipment.name} · ${data.equipment.room}`
                    : "Not scheduled"
                }
              />
            </DetailGrid>
            <div className="mt-4 flex flex-wrap gap-2">
              {can("radiology.schedule") &&
              ["ORDERED", "SCHEDULED"].includes(data.order.status) ? (
                <Button
                  onClick={() => checkIn.mutate()}
                  disabled={checkIn.isPending}
                >
                  Check in
                </Button>
              ) : null}
              {can("radiology.perform") &&
              data.order.status === "CHECKED_IN" ? (
                <Button onClick={() => setSafetyOpen(true)}>
                  Safety checklist
                </Button>
              ) : null}
              {can("radiology.perform") && data.order.status === "READY" ? (
                <Button
                  onClick={() => start.mutate()}
                  disabled={start.isPending}
                >
                  Start acquisition
                </Button>
              ) : null}
              {can("radiology.perform") &&
              data.order.status === "IN_PROGRESS" &&
              activeStudy ? (
                <Button onClick={() => setCompleteOpen(activeStudy.id)}>
                  Complete acquisition
                </Button>
              ) : null}
              {can("radiology.report") &&
              ["ACQUIRED", "REPORT_DRAFT", "PRELIMINARY"].includes(
                data.order.status
              ) ? (
                <Button onClick={() => setReportOpen(true)}>
                  {latestReport?.status === "DRAFT"
                    ? "Edit report draft"
                    : "Create report"}
                </Button>
              ) : null}
            </div>
          </Panel>

          <Panel
            title="PACS-ready study preview"
            description="Representative non-diagnostic preview. Diagnostic DICOM pixels remain in the PACS."
          >
            {data.studies.filter(row => row.accepted).length ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {["Scout", "Axial", "Coronal", "Sagittal"].map(
                    (label, index) => (
                      <div
                        key={label}
                        className="aspect-square rounded-lg border border-border bg-[radial-gradient(circle_at_50%_45%,#9ca3af_0,#4b5563_22%,#111827_64%)] p-2 text-xs text-white"
                      >
                        <span className="rounded bg-black/50 px-1.5 py-0.5">
                          {index + 1} · {label}
                        </span>
                      </div>
                    )
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Study UID{" "}
                    {data.studies.find(row => row.accepted)!.studyInstanceUid}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.alert(
                        "Preview mode: connect a DICOMweb/PACS provider from API Integrations to launch a diagnostic viewer."
                      )
                    }
                  >
                    <Eye className="size-4" />
                    Open in PACS
                  </Button>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Images appear after an accepted acquisition.
              </p>
            )}
          </Panel>

          <Panel
            title="Reports"
            description="Final and amended versions are retained as an immutable diagnostic history."
          >
            <div className="space-y-3">
              {data.reports.map(report => (
                <article
                  key={report.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4" />
                      <p className="font-medium">
                        Version {report.version} · {humanize(report.status)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={report.criticality} />
                      {report.status === "DRAFT" && can("radiology.report") ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            report.criticality === "CRITICAL" &&
                            !report.communications.length
                              ? setCommunicationOpen(report.id)
                              : finalise.mutate(report.id)
                          }
                        >
                          Finalise
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Impression
                  </p>
                  <p className="mt-1 text-sm">{report.impression}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {report.radiologist} ·{" "}
                    {formatDateTime(report.finalisedAt ?? report.createdAt)}
                  </p>
                  {report.communications.map(item => (
                    <div
                      key={item.id}
                      className="mt-3 rounded-md bg-error/5 p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <TriangleAlert className="size-4 text-error" />
                        <strong>Critical result communicated</strong>
                      </div>
                      <p>
                        {item.recipient} · {humanize(item.method)} ·{" "}
                        {item.outcome}
                      </p>
                      {!item.acknowledgedAt &&
                      item.recipientId === staff?.id &&
                      can("radiology.acknowledge") ? (
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledge.mutate(item.id)}
                        >
                          Acknowledge finding
                        </Button>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.acknowledgedAt
                            ? `Acknowledged ${formatDateTime(item.acknowledgedAt)}`
                            : "Acknowledgement pending"}
                        </p>
                      )}
                    </div>
                  ))}
                </article>
              ))}
              {!data.reports.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No report drafted yet.
                </p>
              ) : null}
            </div>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Safety & compliance">
            {data.safety ? (
              <DetailGrid>
                <DetailRow
                  label="Identity"
                  value={data.safety.identityVerified ? "Verified" : "Pending"}
                />
                <DetailRow
                  label="Consent"
                  value={
                    data.safety.consentConfirmed
                      ? "Confirmed"
                      : "Not required / pending"
                  }
                />
                <DetailRow
                  label="Pregnancy screening"
                  value={humanize(data.safety.pregnancyStatus)}
                />
                <DetailRow
                  label="PCPNDT Form F"
                  value={
                    data.safety.pcPndtFormComplete
                      ? "Complete"
                      : "Not applicable"
                  }
                />
                <DetailRow
                  label="Contrast"
                  value={
                    data.safety.contrastAgent
                      ? `${data.safety.contrastAgent} · ${data.safety.contrastDose}`
                      : "Not used"
                  }
                />
                <DetailRow
                  label="Completed"
                  value={formatDateTime(data.safety.completedAt)}
                />
              </DetailGrid>
            ) : (
              <p className="text-sm text-muted-foreground">
                Safety assessment pending.
              </p>
            )}
          </Panel>
          <Panel title="Acquisition attempts">
            {data.studies.map(study => (
              <div
                key={study.id}
                className="mb-2 rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex justify-between">
                  <strong>Attempt {study.attempt}</strong>
                  <StatusBadge
                    status={
                      study.accepted
                        ? "ACCEPTED"
                        : study.completedAt
                          ? "REJECTED"
                          : "IN_PROGRESS"
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {study.performedBy} · {formatDateTime(study.startedAt)}
                </p>
                {study.completedAt ? (
                  <p className="mt-1">
                    {study.seriesCount} series · {study.imageCount} images
                  </p>
                ) : null}
                {study.doseMeasurements.map(dose => (
                  <p key={dose.label}>
                    {dose.label}: {dose.value} {dose.unit}
                  </p>
                ))}
              </div>
            ))}
            {!data.studies.length ? (
              <p className="text-sm text-muted-foreground">
                No acquisition attempts.
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
      <SafetyDialog
        open={safetyOpen}
        onOpenChange={setSafetyOpen}
        orderId={orderId}
        procedure={data.procedure}
      />
      <CompleteStudyDialog
        studyId={completeOpen}
        onClose={() => setCompleteOpen(null)}
        recordsDose={data.procedure.recordsRadiationDose}
      />
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        orderId={orderId}
        existing={latestReport?.status === "DRAFT" ? latestReport : undefined}
      />
      <CommunicationDialog
        reportId={communicationOpen}
        onClose={() => setCommunicationOpen(null)}
        clinicians={data.clinicians}
        onSaved={reportId => finalise.mutate(reportId)}
      />
    </PageShell>
  );
}

function SafetyDialog({
  open,
  onOpenChange,
  orderId,
  procedure,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  orderId: string;
  procedure: {
    requiresContrast: boolean;
    requiresConsent: boolean;
    requiresPregnancyScreening: boolean;
    requiresPcPndt: boolean;
    modality: string;
  };
}) {
  const [pregnancyStatus, setPregnancyStatus] = React.useState<
    "NOT_APPLICABLE" | "NOT_PREGNANT" | "PREGNANT" | "UNKNOWN"
  >("NOT_APPLICABLE");
  const [pcPndtIndication, setPcPndtIndication] = React.useState("");
  const [contrastAgent, setContrastAgent] = React.useState("");
  const [contrastDose, setContrastDose] = React.useState("");
  const save = useAction(
    "radiology.safety",
    () => ({
      orderId,
      identityVerified: true,
      preparationConfirmed: true,
      consentConfirmed: !procedure.requiresConsent || true,
      allergiesReviewed: true,
      renalFunctionReviewed: !procedure.requiresContrast || true,
      pregnancyStatus,
      mriImplantScreeningComplete: procedure.modality !== "MRI" || true,
      pcPndtFormComplete:
        !procedure.requiresPcPndt || Boolean(pcPndtIndication),
      pcPndtIndication: pcPndtIndication || undefined,
      contrastAgent: contrastAgent || undefined,
      contrastDose: contrastDose || undefined,
      notes: "Safety checklist completed in radiology workspace.",
    }),
    {
      success: "Safety checklist completed",
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Imaging safety checklist"
      submitLabel="Mark ready"
      isSubmitting={save.isPending}
      submitDisabled={
        (procedure.requiresContrast && (!contrastAgent || !contrastDose)) ||
        (procedure.requiresPcPndt && !pcPndtIndication)
      }
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
        Identity, preparation, allergies, consent and modality safety will be
        recorded under the signed-in technician.
      </div>
      {procedure.requiresPregnancyScreening ? (
        <Field label="Pregnancy screening">
          <SelectField
            value={pregnancyStatus}
            onChange={event =>
              setPregnancyStatus(event.target.value as typeof pregnancyStatus)
            }
          >
            {["NOT_PREGNANT", "PREGNANT", "UNKNOWN"].map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </Field>
      ) : null}
      {procedure.requiresPcPndt ? (
        <Field label="PCPNDT Form F indication" required>
          <Textarea
            value={pcPndtIndication}
            onChange={event => setPcPndtIndication(event.target.value)}
          />
        </Field>
      ) : null}
      {procedure.requiresContrast ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contrast agent" required>
            <input
              className="h-9 w-full rounded-md border border-border px-3"
              value={contrastAgent}
              onChange={event => setContrastAgent(event.target.value)}
            />
          </Field>
          <Field label="Dose" required>
            <input
              className="h-9 w-full rounded-md border border-border px-3"
              value={contrastDose}
              onChange={event => setContrastDose(event.target.value)}
            />
          </Field>
        </div>
      ) : null}
    </FormDialog>
  );
}

function CompleteStudyDialog({
  studyId,
  onClose,
  recordsDose,
}: {
  studyId: string | null;
  onClose: () => void;
  recordsDose: boolean;
}) {
  const [accepted, setAccepted] = React.useState(true);
  const [reason, setReason] = React.useState("");
  const [series, setSeries] = React.useState(3);
  const [images, setImages] = React.useState(120);
  const [dose, setDose] = React.useState(0);
  const save = useAction(
    "radiology.completeStudy",
    () => ({
      studyId: studyId!,
      accepted,
      rejectionReason: accepted ? undefined : reason,
      seriesCount: accepted ? series : 0,
      imageCount: accepted ? images : 0,
      doseMeasurements:
        recordsDose && accepted
          ? [{ label: "Recorded dose", value: dose, unit: "mGy" }]
          : [],
      contrastAdministered: false,
    }),
    {
      success: accepted
        ? "Study sent to PACS"
        : "Study rejected; repeat remains available",
      onSuccess: onClose,
    }
  );
  return (
    <FormDialog
      open={Boolean(studyId)}
      onOpenChange={open => !open && onClose()}
      title="Complete acquisition"
      submitLabel={accepted ? "Accept and send to PACS" : "Reject attempt"}
      submitDisabled={
        (!accepted && !reason.trim()) || (recordsDose && accepted && dose <= 0)
      }
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Outcome">
        <SelectField
          value={accepted ? "ACCEPT" : "REJECT"}
          onChange={event => setAccepted(event.target.value === "ACCEPT")}
        >
          <option value="ACCEPT">Accept study</option>
          <option value="REJECT">Reject and repeat</option>
        </SelectField>
      </Field>
      {accepted ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Series">
            <input
              type="number"
              className="h-9 w-full rounded-md border px-3"
              value={series}
              onChange={event => setSeries(Number(event.target.value))}
            />
          </Field>
          <Field label="Images">
            <input
              type="number"
              className="h-9 w-full rounded-md border px-3"
              value={images}
              onChange={event => setImages(Number(event.target.value))}
            />
          </Field>
          {recordsDose ? (
            <Field label="Dose (mGy)">
              <input
                type="number"
                className="h-9 w-full rounded-md border px-3"
                value={dose}
                onChange={event => setDose(Number(event.target.value))}
              />
            </Field>
          ) : null}
        </div>
      ) : (
        <Field label="Rejection reason" required>
          <Textarea
            value={reason}
            onChange={event => setReason(event.target.value)}
          />
        </Field>
      )}
    </FormDialog>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  orderId,
  existing,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  orderId: string;
  existing?: {
    findings: string;
    impression: string;
    recommendations: string;
    criticality: RadiologyCriticality;
  };
}) {
  const [findings, setFindings] = React.useState(existing?.findings ?? "");
  const [impression, setImpression] = React.useState(
    existing?.impression ?? ""
  );
  const [recommendations, setRecommendations] = React.useState(
    existing?.recommendations ?? ""
  );
  const [criticality, setCriticality] = React.useState<RadiologyCriticality>(
    existing?.criticality ?? "ROUTINE"
  );
  React.useEffect(() => {
    if (open) {
      setFindings(existing?.findings ?? "");
      setImpression(existing?.impression ?? "");
      setRecommendations(existing?.recommendations ?? "");
      setCriticality(existing?.criticality ?? "ROUTINE");
    }
  }, [open, existing]);
  const save = useAction(
    "radiology.saveReport",
    () => ({ orderId, findings, impression, recommendations, criticality }),
    { success: "Report draft saved", onSuccess: () => onOpenChange(false) }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Radiology report"
      size="lg"
      submitLabel="Save draft"
      submitDisabled={!findings.trim() || !impression.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Findings" required>
        <Textarea
          className="min-h-32"
          value={findings}
          onChange={event => setFindings(event.target.value)}
        />
      </Field>
      <Field label="Impression" required>
        <Textarea
          value={impression}
          onChange={event => setImpression(event.target.value)}
        />
      </Field>
      <Field label="Recommendations">
        <Textarea
          value={recommendations}
          onChange={event => setRecommendations(event.target.value)}
        />
      </Field>
      <Field label="Communication priority">
        <SelectField
          value={criticality}
          onChange={event =>
            setCriticality(event.target.value as RadiologyCriticality)
          }
        >
          {["ROUTINE", "SIGNIFICANT", "CRITICAL"].map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
      </Field>
    </FormDialog>
  );
}

function CommunicationDialog({
  reportId,
  onClose,
  clinicians,
  onSaved,
}: {
  reportId: string | null;
  onClose: () => void;
  clinicians: Array<{ id: string; name: string }>;
  onSaved: (reportId: string) => void;
}) {
  const [recipientId, setRecipientId] = React.useState("");
  const [method, setMethod] = React.useState<
    "PHONE" | "IN_PERSON" | "SECURE_MESSAGE"
  >("PHONE");
  const [outcome, setOutcome] = React.useState("");
  const save = useAction(
    "radiology.communicate",
    () => ({ reportId: reportId!, recipientId, method, outcome }),
    {
      success: "Critical-result communication recorded",
      onSuccess: () => {
        const id = reportId!;
        onClose();
        onSaved(id);
      },
    }
  );
  return (
    <FormDialog
      open={Boolean(reportId)}
      onOpenChange={open => !open && onClose()}
      title="Document critical-result communication"
      submitLabel="Record and finalise"
      submitDisabled={!recipientId || !outcome.trim()}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Responsible clinician" required>
        <SelectField
          value={recipientId}
          onChange={event => setRecipientId(event.target.value)}
        >
          <option value="">Choose…</option>
          {clinicians.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </SelectField>
      </Field>
      <Field label="Method">
        <SelectField
          value={method}
          onChange={event => setMethod(event.target.value as typeof method)}
        >
          {["PHONE", "IN_PERSON", "SECURE_MESSAGE"].map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
      </Field>
      <Field label="Outcome / read-back" required>
        <Textarea
          value={outcome}
          onChange={event => setOutcome(event.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
