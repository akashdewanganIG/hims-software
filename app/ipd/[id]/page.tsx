"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  ArrowRightLeft,
  CheckCheck,
  DoorOpen,
  Flask,
  NotePencil,
  Pill,
  Plus,
} from "@/components/icons";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { EntityLink } from "@/components/shared/entity";
import {
  DetailGrid,
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
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Tag } from "@/components/ui/tag";
import {
  LabOrderCard,
  PatientBanner,
  PrescriptionCard,
} from "@/features/clinical/components";
import { useAdmission, type AdmissionDetail } from "@/features/ipd/api";
import {
  CareOrderDialog,
  NoteDialog,
  TransferDialog,
} from "@/features/ipd/dialogs";
import { DischargePanel } from "@/features/ipd/discharge-panel";
import { LabOrderForm } from "@/features/opd/lab-order-form";
import { PrescriptionBuilder } from "@/features/opd/prescription-builder";
import { useAction } from "@/lib/api/client";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatINR,
  humanize,
} from "@/lib/format";
import { pdfName } from "@/lib/pdf/layout";
import { dischargeSummaryPdf } from "@/lib/pdf/records";
import { useSession } from "@/lib/session";

type Tab = "overview" | "notes" | "orders" | "bed" | "billing" | "discharge";

export default function AdmissionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAdmission(id);
  const [tab, setTab] = React.useState<Tab>("overview");

  React.useEffect(() => {
    if (data?.admission.status === "DISCHARGE_PENDING")
      setTab(current => (current === "overview" ? "discharge" : current));
  }, [data?.admission.status]);

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
          title="Admission not found"
          action={
            <Button asChild variant="outline">
              <Link href="/ipd">Back to inpatients</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const { admission, row } = data;
  const tabs = [
    { value: "overview" as const, label: "Overview" },
    {
      value: "notes" as const,
      label: "Clinical notes",
      count: data.notes.length,
    },
    {
      value: "orders" as const,
      label: "Orders",
      count:
        data.prescriptions.length +
        data.labOrders.length +
        data.careOrders.filter(o => o.status === "ACTIVE").length,
    },
    { value: "bed" as const, label: "Bed & transfers" },
    { value: "billing" as const, label: "Billing" },
    { value: "discharge" as const, label: "Discharge" },
  ];

  return (
    <PageShell>
      <PageHeader
        title={`Admission ${admission.code}`}
        breadcrumb={[{ label: "IPD", href: "/ipd" }, { label: admission.code }]}
      />
      <PatientBanner
        patient={data.patient}
        recordHref={`/patients/${data.patient.id}`}
        badges={
          <>
            <StatusBadge status={admission.status} />
            {row.bed ? (
              <Tag tone="neutral">{`${row.bed.ward} · ${row.bed.code}`}</Tag>
            ) : null}
          </>
        }
        meta={
          <span>
            {row.doctor} · {row.department} · day {row.lengthOfStay}
          </span>
        }
        actions={
          <AdmissionActions
            detail={data}
            onOpenDischarge={() => setTab("discharge")}
          />
        }
      />

      {admission.status === "TRANSFER_PENDING" && data.pendingTransferBed ? (
        <TransferBanner detail={data} />
      ) : null}

      <section aria-label="Stay summary" className="grid-auto-fit-sm gap-3">
        <MiniStat
          label="Admitted"
          value={formatDateShort(admission.admittedAt)}
        />
        <MiniStat label="Length of stay" value={`${row.lengthOfStay} d`} />
        <MiniStat
          label="Expected discharge"
          value={
            admission.expectedDischargeDate
              ? formatDateShort(admission.expectedDischargeDate)
              : "—"
          }
        />
        <MiniStat
          label="Charges so far"
          value={formatINR(row.charges, true)}
          tone="info"
        />
        <MiniStat
          label="Pending labs"
          value={row.pendingLabs}
          tone={row.pendingLabs ? "critical" : "neutral"}
        />
        <MiniStat
          label="Pending Rx"
          value={row.pendingRx}
          tone={row.pendingRx ? "critical" : "neutral"}
        />
      </section>

      <div className="flex flex-col gap-3">
        <CategorySwitcher
          label="Admission sections"
          items={tabs}
          value={tab}
          onValueChange={setTab}
        />
        {tab === "overview" ? <Overview detail={data} /> : null}
        {tab === "notes" ? <Notes detail={data} /> : null}
        {tab === "orders" ? <Orders detail={data} /> : null}
        {tab === "bed" ? <BedHistory detail={data} /> : null}
        {tab === "billing" ? <Billing detail={data} /> : null}
        {tab === "discharge" ? (
          <Panel
            title="Discharge"
            description="Summary, take-home medication and final discharge."
          >
            <DischargePanel detail={data} />
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}

function AdmissionActions({
  detail,
  onOpenDischarge,
}: {
  detail: AdmissionDetail;
  onOpenDischarge: () => void;
}) {
  const { can } = useSession();
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [confirmDischarge, setConfirmDischarge] = React.useState(false);
  const { admission } = detail;
  const live = admission.status === "ADMITTED" || admission.status === "ACTIVE";
  const initiate = useAction(
    "ipd.initiateDischarge",
    () => ({ admissionId: admission.id }),
    {
      success: "Discharge initiated — complete the summary",
      onSuccess: onOpenDischarge,
    }
  );
  if (admission.status === "DISCHARGED") {
    return (
      <>
        {detail.summary ? (
          <DownloadPdfButton
            label="Download summary"
            fileName={pdfName("Discharge-summary", admission.code)}
            build={() => dischargeSummaryPdf(detail)}
          />
        ) : null}
        <Button asChild variant="outline">
          <Link href={`/ipd/${admission.id}/summary`}>Discharge summary</Link>
        </Button>
      </>
    );
  }
  return (
    <>
      {can("ipd.note") ? (
        <Button variant="outline" onClick={() => setNoteOpen(true)}>
          <NotePencil className="size-4" />
          Add note
        </Button>
      ) : null}
      {live && can("ipd.transfer") ? (
        <Button variant="outline" onClick={() => setTransferOpen(true)}>
          <ArrowRightLeft className="size-4" />
          Transfer
        </Button>
      ) : null}
      {live && can("ipd.discharge") ? (
        <Button onClick={() => setConfirmDischarge(true)}>
          <DoorOpen className="size-4" />
          Initiate discharge
        </Button>
      ) : null}
      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        admissionId={admission.id}
        hasAdmissionNote={detail.notes.some(n => n.type === "ADMISSION")}
      />
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        admissionId={admission.id}
        currentBed={
          detail.row.bed
            ? `${detail.row.bed.ward} · ${detail.row.bed.code}`
            : undefined
        }
        patient={{ gender: detail.patient.gender, age: detail.patient.age }}
      />
      <ConfirmationDialog
        open={confirmDischarge}
        onOpenChange={setConfirmDischarge}
        title="Initiate discharge?"
        description="The admission moves to discharge pending and a draft discharge summary is created. New orders are then limited to discharge medication."
        confirmText="Initiate discharge"
        onConfirm={async () => {
          await initiate.mutateAsync();
        }}
      />
    </>
  );
}

function TransferBanner({ detail }: { detail: AdmissionDetail }) {
  const { can } = useSession();
  const complete = useAction(
    "ipd.completeTransfer",
    () => ({ admissionId: detail.admission.id }),
    { success: "Transfer completed — previous bed sent for cleaning" }
  );
  const cancel = useAction(
    "ipd.cancelTransfer",
    () => ({ admissionId: detail.admission.id }),
    { success: "Transfer cancelled — held bed released" }
  );
  const t = detail.admission.pendingTransfer!;
  return (
    <Alert
      tone="info"
      title={`Transfer pending to ${detail.pendingTransferBed!.ward} · ${detail.pendingTransferBed!.code}`}
      action={
        can("ipd.transfer") ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => complete.mutate()}
              disabled={complete.isPending}
            >
              Complete move
            </Button>
          </div>
        ) : null
      }
    >
      {t.reason} · requested {formatDateTime(t.requestedAt)}. The target bed is
      held as reserved.
    </Alert>
  );
}

function Overview({ detail }: { detail: AdmissionDetail }) {
  const { admission, row } = detail;
  const activeOrders = detail.careOrders.filter(o => o.status === "ACTIVE");
  const activeRx = detail.prescriptions
    .filter(
      p =>
        p.status === "PENDING" ||
        p.status === "PARTIALLY_DISPENSED" ||
        p.status === "DISPENSED"
    )
    .slice(0, 3);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Admission">
          <DetailGrid columns={3}>
            <DetailRow label="Reason" value={admission.reason} />
            <DetailRow
              label="Provisional diagnosis"
              value={admission.provisionalDiagnosis}
            />
            <DetailRow
              label="Working diagnosis"
              value={detail.diagnoses.join("; ")}
            />
            <DetailRow
              label="Consultant"
              value={`${row.doctor} · ${row.department}`}
            />
            <DetailRow
              label="Admitted"
              value={formatDateTime(admission.admittedAt)}
            />
            <DetailRow
              label="Source"
              value={
                detail.sourceVisit ? (
                  <EntityLink
                    href={`/opd/visits/${detail.sourceVisit.id}`}
                    module="opd"
                  >
                    OPD {detail.sourceVisit.code}
                  </EntityLink>
                ) : (
                  humanize(admission.source)
                )
              }
            />
            <DetailRow
              label="Bed"
              value={
                row.bed
                  ? `${row.bed.ward} · ${row.bed.code} (floor ${row.bed.floor})`
                  : "—"
              }
            />
            <DetailRow
              label="Expected discharge"
              value={formatDate(admission.expectedDischargeDate)}
            />
            {admission.dischargedAt ? (
              <DetailRow
                label="Discharged"
                value={formatDateTime(admission.dischargedAt)}
              />
            ) : null}
          </DetailGrid>
        </Panel>
        <Panel title="Latest notes">
          <Timeline
            entries={detail.notes.slice(0, 5).map(n => ({
              id: n.id,
              at: n.at,
              title: `${humanize(n.type)} note · ${n.author}`,
              meta: formatDateTime(n.at),
              body: n.text,
              tone:
                n.type === "PROGRESS"
                  ? "info"
                  : n.type === "PROCEDURE"
                    ? "warning"
                    : "neutral",
            }))}
            empty="No notes yet."
          />
        </Panel>
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <Panel
          title="Current orders"
          description="Active care orders and medication."
        >
          {activeOrders.length || activeRx.length ? (
            <ul className="space-y-2 text-[0.8125rem]">
              {activeOrders.map(o => (
                <li key={o.id} className="flex items-start gap-2">
                  <Tag tone="progress" className="mt-0.5">
                    {humanize(o.type)}
                  </Tag>
                  <span>{o.instruction}</span>
                </li>
              ))}
              {activeRx.flatMap(rx =>
                rx.items
                  .filter(i => i.status !== "CANCELLED")
                  .map(i => (
                    <li key={i.id} className="flex items-start gap-2">
                      <Tag tone="neutral" className="mt-0.5">
                        Rx
                      </Tag>
                      <span>
                        {i.medicine} {i.strength} · {i.dose} {i.frequency}
                      </span>
                    </li>
                  ))
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No active orders.</p>
          )}
        </Panel>
        <Panel title="Case file (MRD)">
          {detail.medicalRecord ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <EntityLink
                  href={`/mrd?open=${detail.medicalRecord.id}`}
                  module="mrd"
                  className="font-mono text-xs"
                >
                  {detail.medicalRecord.code}
                </EntityLink>
                <StatusBadge status={detail.medicalRecord.status} />
              </div>
              <ul className="space-y-1 text-xs">
                {detail.medicalRecord.checklist.map(item => (
                  <li
                    key={item.key}
                    className={
                      item.done
                        ? "text-success-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {item.done ? "✓" : "○"} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function Notes({ detail }: { detail: AdmissionDetail }) {
  const [filter, setFilter] = React.useState<
    "ALL" | "PROGRESS" | "NURSING" | "OTHER"
  >("ALL");
  const notes = detail.notes.filter(
    n =>
      filter === "ALL" ||
      (filter === "OTHER"
        ? n.type === "ADMISSION" || n.type === "PROCEDURE"
        : n.type === filter)
  );
  return (
    <Panel
      title="Clinical notes"
      description="Daily doctor and nursing notes for this admission."
      actions={
        <CategorySwitcher
          label="Note type"
          value={filter}
          onValueChange={setFilter}
          items={[
            { value: "ALL", label: "All" },
            { value: "PROGRESS", label: "Doctor" },
            { value: "NURSING", label: "Nursing" },
            { value: "OTHER", label: "Admission & procedure" },
          ]}
        />
      }
    >
      <Timeline
        entries={notes.map(n => ({
          id: n.id,
          at: n.at,
          title: `${humanize(n.type)} · ${n.author}`,
          meta: formatDateTime(n.at),
          body: n.text,
          tone:
            n.type === "PROGRESS"
              ? "info"
              : n.type === "PROCEDURE"
                ? "warning"
                : n.type === "ADMISSION"
                  ? "success"
                  : "neutral",
        }))}
      />
    </Panel>
  );
}

function Orders({ detail }: { detail: AdmissionDetail }) {
  const { can } = useSession();
  const [careOpen, setCareOpen] = React.useState(false);
  const [showRx, setShowRx] = React.useState(false);
  const [showLab, setShowLab] = React.useState(false);
  const live =
    detail.admission.status === "ADMITTED" ||
    detail.admission.status === "ACTIVE" ||
    detail.admission.status === "TRANSFER_PENDING";
  const end = useAction(
    "ipd.endCareOrder",
    (v: { id: string; status: "COMPLETED" | "DISCONTINUED" }) => ({
      orderId: v.id,
      status: v.status,
    }),
    { success: "Order updated" }
  );
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Panel
        title="Medication"
        actions={
          live && can("ipd.order") && !showRx ? (
            <Button size="sm" variant="outline" onClick={() => setShowRx(true)}>
              <Pill className="size-4" />
              Prescribe
            </Button>
          ) : null
        }
      >
        <div className="space-y-3">
          {showRx ? (
            <PrescriptionBuilder
              encounterId={detail.encounterId}
              allergies={detail.patient.allergies}
              onDone={() => setShowRx(false)}
            />
          ) : null}
          {detail.prescriptions.map(rx => (
            <PrescriptionCard
              key={rx.id}
              rx={rx}
              cancellable={
                can("opd.consult") || can("ipd.order") || can("ipd.discharge")
              }
            />
          ))}
          {!detail.prescriptions.length && !showRx ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              No medication orders.
            </p>
          ) : null}
        </div>
      </Panel>
      <div className="flex min-w-0 flex-col gap-4">
        <Panel
          title="Investigations"
          actions={
            live && can("lab.order") && !showLab ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowLab(true)}
              >
                <Flask className="size-4" />
                Order tests
              </Button>
            ) : null
          }
        >
          <div className="space-y-3">
            {showLab ? (
              <LabOrderForm
                encounterId={detail.encounterId}
                onDone={() => setShowLab(false)}
              />
            ) : null}
            {detail.labOrders.map(o => (
              <LabOrderCard key={o.id} order={o} />
            ))}
            {!detail.labOrders.length && !showLab ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                No lab orders.
              </p>
            ) : null}
          </div>
        </Panel>
        <Panel
          title="Care orders"
          actions={
            live && can("ipd.order") ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCareOpen(true)}
              >
                <Plus className="size-4" />
                New order
              </Button>
            ) : null
          }
        >
          {detail.careOrders.length ? (
            <ul className="divide-y divide-border">
              {detail.careOrders.map(o => (
                <li
                  key={o.id}
                  className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-[0.8125rem]">
                      <Tag tone="neutral" className="mr-1.5">
                        {humanize(o.type)}
                      </Tag>
                      {o.instruction}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {o.orderedBy} · {formatDateTime(o.orderedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge status={o.status} />
                    {o.status === "ACTIVE" && can("ipd.order") ? (
                      <>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Mark completed"
                          title="Mark completed"
                          onClick={() =>
                            end.mutate({ id: o.id, status: "COMPLETED" })
                          }
                        >
                          <CheckCheck className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            end.mutate({ id: o.id, status: "DISCONTINUED" })
                          }
                        >
                          Stop
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No care orders.</p>
          )}
        </Panel>
      </div>
      <CareOrderDialog
        open={careOpen}
        onOpenChange={setCareOpen}
        admissionId={detail.admission.id}
      />
    </div>
  );
}

function BedHistory({ detail }: { detail: AdmissionDetail }) {
  return (
    <Panel
      title="Bed assignments"
      description="Every stay in a bed, newest first. Room charges post when a stay closes."
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="h-10 px-4">Bed</th>
              <th className="px-3">Ward</th>
              <th className="px-3">From</th>
              <th className="px-3">To</th>
              <th className="px-3 text-right">Days</th>
              <th className="px-4">Reason</th>
            </tr>
          </thead>
          <tbody>
            {detail.bedHistory.map(b => (
              <tr
                key={b.id}
                className="border-b border-border/80 last:border-0"
              >
                <td className="px-4 py-2.5 font-medium">{b.bed.code}</td>
                <td className="px-3 py-2.5">{b.bed.ward}</td>
                <td className="px-3 py-2.5 tabular-nums">
                  {formatDateTime(b.fromAt)}
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {b.toAt ? (
                    formatDateTime(b.toAt)
                  ) : (
                    <Tag tone="progress">Current</Tag>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {b.days}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {b.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Billing({ detail }: { detail: AdmissionDetail }) {
  return (
    <div className="flex flex-col gap-4">
      {detail.unposted > 0 ? (
        <Alert
          tone="info"
          title={`${formatINR(detail.unposted)} accruing in the current bed`}
        >
          Room and nursing charges for the current bed post to the bill on
          transfer or discharge.
        </Alert>
      ) : null}
      {detail.bills.map(bill => (
        <Panel
          key={bill.id}
          flush
          title={`${bill.code}${bill.status === "DRAFT" ? " · running bill" : ""}`}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={bill.status} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/billing/${bill.id}`}>Open in Billing</Link>
              </Button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <tbody>
                {bill.items.map(item => (
                  <tr
                    key={item.id}
                    className="border-b border-border/80 last:border-0"
                  >
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDateShort(item.serviceDate)}
                    </td>
                    <td className="px-3 py-2">
                      <Tag tone="neutral" className="mr-2">
                        {humanize(item.category)}
                      </Tag>
                      {item.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {item.quantity} × {formatINR(item.unitPrice)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {formatINR(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-border px-4 py-2.5 text-sm tabular-nums">
            <span>
              Total <strong>{formatINR(bill.total)}</strong>
            </span>
            <span>Paid {formatINR(bill.paid)}</span>
            <span
              className={
                bill.balance > 0 ? "font-semibold text-error-foreground" : ""
              }
            >
              Balance {formatINR(bill.balance)}
            </span>
            {bill.refundDue > 0 ? (
              <span className="text-info-foreground">
                Refund due {formatINR(bill.refundDue)}
              </span>
            ) : null}
          </div>
        </Panel>
      ))}
      {!detail.bills.length ? (
        <p className="text-sm text-muted-foreground">No bills yet.</p>
      ) : null}
    </div>
  );
}
