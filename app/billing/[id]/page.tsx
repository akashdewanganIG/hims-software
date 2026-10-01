"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  Ban,
  CreditCard,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
} from "@/components/icons";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { EntityLink, RefCode } from "@/components/shared/entity";
import {
  DetailGrid,
  DetailRow,
  EmptyState,
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  StatusBadge,
} from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Tag } from "@/components/ui/tag";
import { useInvoice } from "@/features/billing/api";
import {
  CancelInvoiceDialog,
  ChargeDialog,
  DiscountDialog,
  PaymentDialog,
  RefundDialog,
} from "@/features/billing/dialogs";
import {
  formatDateShort,
  formatDateTime,
  formatINR,
  humanize,
} from "@/lib/format";
import { useAction } from "@/lib/api/client";
import { pdfName } from "@/lib/pdf/layout";
import { invoicePdf } from "@/lib/pdf/records";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data, isLoading, error } = useInvoice(id);
  const [payOpen, setPayOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [chargeOpen, setChargeOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<{
    id: string;
    description: string;
  } | null>(null);
  const removeCharge = useAction(
    "billing.removeCharge",
    () => ({ itemId: removing!.id }),
    { success: "Charge removed", onSuccess: () => setRemoving(null) }
  );
  const [discountFor, setDiscountFor] = React.useState<{
    id: string;
    description: string;
    gross: number;
    discount: number;
  } | null>(null);

  if (isLoading) {
    return (
      <PageShell>
        <PanelRowsSkeleton rows={10} />
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell>
        <ErrorBanner error={error} />
        <EmptyState
          title="Bill not found"
          action={
            <Button asChild variant="outline">
              <Link href="/billing">Back to billing</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const { invoice, totals } = data;
  const open =
    invoice.status === "DRAFT" ||
    invoice.status === "PENDING" ||
    invoice.status === "PARTIALLY_PAID";
  const adjustable = open && can("billing.adjust");
  // A running (draft) admission bill always takes advance deposits.
  const collectable =
    invoice.status === "DRAFT" ||
    (invoice.status !== "CANCELLED" && totals.balance > 0);

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Bill {invoice.code}
            <StatusBadge
              status={invoice.status}
              label={invoice.status === "DRAFT" ? "Running bill" : undefined}
            />
          </span>
        }
        breadcrumb={[
          { label: "Billing", href: "/billing" },
          { label: invoice.code },
        ]}
        actions={
          <>
            <DownloadPdfButton
              fileName={pdfName("Bill", invoice.code)}
              build={() => invoicePdf(data)}
            />
            <Button asChild variant="outline">
              <Link href={`/billing/${invoice.id}/print`}>
                <Printer className="size-4" />
                Print
              </Link>
            </Button>
            {open && can("billing.adjust") ? (
              <Button variant="outline" onClick={() => setChargeOpen(true)}>
                <Plus className="size-4" />
                Add charge
              </Button>
            ) : null}
            {totals.netPaid > 0 && can("billing.refund") ? (
              <Button variant="outline" onClick={() => setRefundOpen(true)}>
                <RotateCcw className="size-4" />
                Refund
              </Button>
            ) : null}
            {invoice.status !== "CANCELLED" &&
            invoice.status !== "DRAFT" &&
            totals.netPaid <= 0 &&
            can("billing.adjust") ? (
              <Button
                variant="outline"
                className="text-error-foreground"
                onClick={() => setCancelOpen(true)}
              >
                <Ban className="size-4" />
                Cancel
              </Button>
            ) : null}
            {collectable && can("billing.collect") ? (
              <Button variant="raised" onClick={() => setPayOpen(true)}>
                <CreditCard className="size-4" />
                {invoice.status === "DRAFT"
                  ? "Collect deposit"
                  : `Collect ${formatINR(totals.balance)}`}
              </Button>
            ) : null}
          </>
        }
      />

      {invoice.status === "DRAFT" ? (
        <Alert tone="info" title="Running bill">
          Charges keep accruing while the patient is admitted; room and nursing
          charges post on transfer or discharge. Deposits can be collected
          against it; the final bill is issued at discharge.
        </Alert>
      ) : null}
      {totals.refundDue > 0 ? (
        <Alert
          tone="warning"
          title={`Refund due: ${formatINR(totals.refundDue)}`}
        >
          More has been collected than the bill total — usually after a medicine
          return credited this bill.
        </Alert>
      ) : null}
      {invoice.status === "CANCELLED" ? (
        <Alert tone="error" title="Cancelled">
          {invoice.cancelReason}
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Billed to">
            <DetailGrid columns={3}>
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
                label="UHID"
                value={
                  <RefCode className="text-foreground">
                    {data.patient.uhid}
                  </RefCode>
                }
              />
              <DetailRow
                label="Age / sex"
                value={`${data.patient.age} y · ${humanize(data.patient.gender)}`}
              />
              {data.admission ? (
                <>
                  <DetailRow
                    label="Admission"
                    value={
                      <EntityLink
                        href={`/ipd/${data.admission.id}`}
                        module="ipd"
                      >
                        {data.admission.code}
                      </EntityLink>
                    }
                  />
                  <DetailRow label="Bed" value={data.admission.bed} />
                  <DetailRow
                    label="Stay"
                    value={`${formatDateShort(data.admission.admittedAt)} – ${data.admission.dischargedAt ? formatDateShort(data.admission.dischargedAt) : "ongoing"}`}
                  />
                </>
              ) : data.encounter ? (
                <>
                  <DetailRow
                    label="Visit"
                    value={
                      data.encounter.type === "OPD" ? (
                        <EntityLink
                          href={`/opd/visits/${data.encounter.id}`}
                          module="opd"
                        >
                          {data.encounter.code}
                        </EntityLink>
                      ) : (
                        data.encounter.code
                      )
                    }
                  />
                  <DetailRow
                    label="Doctor"
                    value={`${data.encounter.doctor} · ${data.encounter.department}`}
                  />
                  <DetailRow
                    label="Visit date"
                    value={formatDateTime(data.encounter.startedAt)}
                  />
                </>
              ) : null}
            </DetailGrid>
          </Panel>

          <Panel
            flush
            title="Line items"
            description="Each line comes from its source: appointment, lab test, pharmacy draw, bed stay or a manual charge."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="h-10 px-4">Date</th>
                    <th className="px-3">Description</th>
                    <th className="px-3 text-right">Qty</th>
                    <th className="px-3 text-right">Rate</th>
                    <th className="px-3 text-right">Discount</th>
                    <th className="px-4 text-right">Amount</th>
                    {adjustable ? (
                      <th className="w-10 px-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => {
                    const gross = item.quantity * item.unitPrice;
                    const canDiscount =
                      open && gross > 0 && can("billing.adjust");
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b border-border/80 last:border-0",
                          item.quantity < 0 && "text-info-foreground"
                        )}
                      >
                        <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">
                          {formatDateShort(item.serviceDate)}
                        </td>
                        <td className="px-3 py-2">
                          <Tag tone="neutral" className="mr-2">
                            {humanize(item.category)}
                          </Tag>
                          {item.description}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatINR(item.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {canDiscount ? (
                            <button
                              type="button"
                              className="rounded-sm text-primary outline-none hover:text-info focus-visible:ring-2 focus-visible:ring-ring/30"
                              onClick={() =>
                                setDiscountFor({
                                  id: item.id,
                                  description: item.description,
                                  gross,
                                  discount: item.discount,
                                })
                              }
                            >
                              {item.discount
                                ? `−${formatINR(item.discount)}`
                                : "Add"}
                            </button>
                          ) : item.discount ? (
                            `−${formatINR(item.discount)}`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">
                          {formatINR(item.amount)}
                        </td>
                        {adjustable ? (
                          <td className="px-2 py-1 text-right">
                            {item.sourceType === "MANUAL" ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove ${item.description}`}
                                onClick={() =>
                                  setRemoving({
                                    id: item.id,
                                    description: item.description,
                                  })
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  {!data.items.length ? (
                    <tr>
                      <td
                        colSpan={adjustable ? 7 : 6}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No charges on this bill.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel flush title="Payments & refunds">
            {data.payments.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {data.payments.map(p => (
                    <tr
                      key={p.id}
                      className="border-b border-border/80 last:border-0"
                    >
                      <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {formatDateTime(p.receivedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Tag tone={p.kind === "REFUND" ? "pending" : "active"}>
                          {p.kind === "REFUND" ? "Refund" : humanize(p.method)}
                        </Tag>
                        {p.reference ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {p.reference}
                          </span>
                        ) : null}
                        {p.note ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {p.note}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {p.receivedBy}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right font-medium tabular-nums",
                          p.kind === "REFUND" && "text-info-foreground"
                        )}
                      >
                        {p.kind === "REFUND" ? "−" : ""}
                        {formatINR(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing collected yet.
              </p>
            )}
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
          <Panel title="Summary">
            <dl className="space-y-1.5 text-sm">
              {data.subtotals.map(s => (
                <div key={s.category} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {humanize(s.category)}
                  </dt>
                  <dd className="tabular-nums">{formatINR(s.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                <dt className="text-muted-foreground">Gross</dt>
                <dd className="tabular-nums">{formatINR(totals.gross)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Discounts</dt>
                <dd className="tabular-nums">−{formatINR(totals.discount)}</dd>
              </div>
              <div className="flex justify-between gap-3 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatINR(totals.total)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular-nums">{formatINR(totals.paid)}</dd>
              </div>
              {totals.refunded ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Refunded</dt>
                  <dd className="tabular-nums">
                    −{formatINR(totals.refunded)}
                  </dd>
                </div>
              ) : null}
              <div
                className={cn(
                  "flex justify-between gap-3 border-t border-border pt-1.5 font-semibold",
                  totals.balance > 0 && "text-error-foreground"
                )}
              >
                <dt>Balance</dt>
                <dd className="tabular-nums">{formatINR(totals.balance)}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Bill details">
            <DetailRow
              label="Raised"
              value={formatDateTime(invoice.createdAt)}
            />
            {invoice.finalisedAt ? (
              <DetailRow
                label="Issued (final)"
                value={formatDateTime(invoice.finalisedAt)}
              />
            ) : null}
            <DetailRow label="Setting" value={data.setting} />
          </Panel>
        </aside>
      </div>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        invoiceId={invoice.id}
        balance={totals.balance}
        deposit={invoice.status === "DRAFT"}
      />
      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        invoiceId={invoice.id}
        max={totals.netPaid}
        suggested={totals.refundDue}
      />
      <ChargeDialog
        open={chargeOpen}
        onOpenChange={setChargeOpen}
        invoiceId={invoice.id}
      />
      <DiscountDialog item={discountFor} onClose={() => setDiscountFor(null)} />
      <ConfirmationDialog
        open={Boolean(removing)}
        onOpenChange={next => !next && setRemoving(null)}
        title="Remove charge?"
        description={`"${removing?.description ?? ""}" will be taken off bill ${invoice.code}. Only charges added at the billing desk can be removed; the removal is kept in the audit trail.`}
        confirmText="Remove charge"
        variant="destructive"
        isLoading={removeCharge.isPending}
        onConfirm={async () => {
          await removeCharge.mutateAsync();
        }}
      />
      <CancelInvoiceDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        invoiceId={invoice.id}
      />
    </PageShell>
  );
}
