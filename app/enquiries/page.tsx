"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  CalendarCheck,
  Clock,
  Phone,
  Plus,
  TrendingUp,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EntityLink, RefCode } from "@/components/shared/entity";
import {
  DetailGrid,
  DetailRow,
  ErrorBanner,
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
import { Tag } from "@/components/ui/tag";
import {
  useEnquiries,
  useEnquiry,
  useEnquirySummary,
  type EnquiryRow,
  type EnquiryView,
} from "@/features/enquiry/api";
import {
  EnquiryFormDialog,
  FollowUpDialog,
  ReasonDialog,
  RescheduleFollowUpDialog,
} from "@/features/enquiry/dialogs";
import { BookAppointmentDialog } from "@/features/opd/booking-dialogs";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatINR,
  formatPhone,
  humanize,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import { ENQUIRY_SOURCES } from "@/lib/sim/schema";

export default function EnquiriesPage() {
  return (
    <React.Suspense>
      <Enquiries />
    </React.Suspense>
  );
}

function Enquiries() {
  const params = useSearchParams();
  const { can } = useSession();
  const [view, setView] = React.useState<EnquiryView>(
    params.get("open") ? "all" : "open"
  );
  const [q, setQ] = React.useState("");
  const [source, setSource] = React.useState("");
  const [type, setType] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));
  const [createOpen, setCreateOpen] = React.useState(false);
  const {
    data: rows = [],
    isLoading,
    error,
  } = useEnquiries({
    view,
    q: q || undefined,
    source: source || undefined,
    type: type || undefined,
  });
  const { data: summary } = useEnquirySummary();

  const columns: Column<EnquiryRow>[] = [
    {
      id: "code",
      header: "Enquiry",
      sortValue: r => r.code,
      cell: r => <RefCode className="text-foreground">{r.code}</RefCode>,
    },
    {
      id: "created",
      header: "Logged",
      sortValue: r => r.createdAt,
      cell: r => (
        <span className="tabular-nums">{formatDateShort(r.createdAt)}</span>
      ),
    },
    {
      id: "name",
      header: "Enquirer",
      sortValue: r => r.name,
      cell: r => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatPhone(r.phone)}
            {r.patient ? (
              <>
                {" "}
                · <span className="font-mono">{r.patient.uhid}</span>
              </>
            ) : (
              " · not registered"
            )}
          </p>
        </div>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: r => <span className="line-clamp-2 max-w-64">{r.reason}</span>,
    },
    {
      id: "source",
      header: "Source",
      sortValue: r => r.source,
      cell: r => (
        <div>
          <Tag tone={r.type === "INTERNAL" ? "progress" : "neutral"}>
            {r.type === "INTERNAL" ? "Internal" : humanize(r.source)}
          </Tag>
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      sortValue: r => r.department,
      cell: r => r.department,
    },
    {
      id: "assigned",
      header: "Assigned",
      defaultHidden: true,
      cell: r => r.assignedTo,
    },
    {
      id: "follow",
      header: "Follow-up",
      sortValue: r => r.followUpDate,
      cell: r =>
        r.followUpDate ? (
          <span
            className={
              r.followUpState === "overdue"
                ? "font-semibold text-error-foreground"
                : r.followUpState === "today"
                  ? "font-semibold text-warning-foreground"
                  : ""
            }
          >
            {r.followUpState === "today"
              ? "Today"
              : formatDateShort(r.followUpDate)}
          </span>
        ) : r.appointmentCode ? (
          <RefCode>{r.appointmentCode}</RefCode>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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
        title="Enquiries"
        subtitle="Calls, walk-ins, web and WhatsApp enquiries and internal referrals — tracked from first contact to a completed visit."
        actions={
          can("enquiry.manage") ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New enquiry
            </Button>
          ) : null
        }
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Open enquiries"
          value={summary?.open ?? 0}
          icon={Phone}
          loading={!summary}
          hint={`${summary?.newToday ?? 0} logged today`}
        />
        <StatCard
          label="Follow-ups due"
          value={(summary?.dueToday ?? 0) + (summary?.overdue ?? 0)}
          icon={Clock}
          loading={!summary}
          tone={
            summary?.overdue
              ? "critical"
              : summary?.dueToday
                ? "warning"
                : "neutral"
          }
          hint={`${summary?.overdue ?? 0} overdue`}
        />
        <StatCard
          label="Appointment booked"
          value={summary?.scheduled ?? 0}
          icon={CalendarCheck}
          loading={!summary}
          tone="info"
        />
        <StatCard
          label="Converted · 30 d"
          value={summary?.converted30 ?? 0}
          icon={TrendingUp}
          loading={!summary}
          tone="positive"
          hint={`${summary?.conversionRate ?? 0}% of decided enquiries`}
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={
            view === "due"
              ? { id: "follow", direction: "asc" }
              : { id: "created", direction: "desc" }
          }
          empty="No enquiries in this view."
          onRowClick={r => setOpenId(r.id)}
          rowClassName={r =>
            r.followUpState === "overdue" ? "bg-error-surface/30" : undefined
          }
          toolbar={
            <>
              <CategorySwitcher
                label="Enquiry view"
                value={view}
                onValueChange={setView}
                items={[
                  { value: "open", label: "Open", count: summary?.open },
                  {
                    value: "due",
                    label: "Follow-up due",
                    count: (summary?.dueToday ?? 0) + (summary?.overdue ?? 0),
                  },
                  { value: "scheduled", label: "Booked" },
                  { value: "converted", label: "Converted" },
                  { value: "closed", label: "Closed" },
                  { value: "all", label: "All" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Name, phone, ENQ number or reason"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-40"
                aria-label="Type"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="">All types</option>
                <option value="EXTERNAL">External</option>
                <option value="INTERNAL">Internal</option>
              </SelectField>
              <SelectField
                className="w-full sm:w-44"
                aria-label="Source"
                value={source}
                onChange={e => setSource(e.target.value)}
              >
                <option value="">All sources</option>
                {ENQUIRY_SOURCES.map(s => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </SelectField>
            </>
          }
        />
      </Panel>
      <EnquirySheet id={openId} onClose={() => setOpenId(null)} />
      <EnquiryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={id => setOpenId(id)}
      />
    </PageShell>
  );
}

function EnquirySheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const { data } = useEnquiry(id);
  const [dialog, setDialog] = React.useState<
    null | "edit" | "follow" | "reschedule" | "convert" | "cancel" | "close"
  >(null);
  const manage = can("enquiry.manage");
  const e = data?.enquiry;
  const live =
    e &&
    (e.status === "NEW" ||
      e.status === "FOLLOW_UP_REQUIRED" ||
      e.status === "APPOINTMENT_SCHEDULED");
  const convertible =
    e && (e.status === "NEW" || e.status === "FOLLOW_UP_REQUIRED");

  return (
    <>
      <Sheet open={Boolean(id)} onOpenChange={open => !open && onClose()}>
        <SheetContent size="lg">
          {!data || !e ? (
            <SheetBody className="space-y-3">
              <SheetTitle className="sr-only">Loading enquiry</SheetTitle>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-40 w-full" />
            </SheetBody>
          ) : (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>{e.prospectName}</SheetTitle>
                  <StatusBadge status={e.status} />
                  <Tag tone={e.type === "INTERNAL" ? "progress" : "neutral"}>
                    {e.type === "INTERNAL" ? "Internal" : "External"}
                  </Tag>
                </div>
                <SheetDescription>
                  {e.code} · {humanize(e.source)} · logged{" "}
                  {formatDateTime(e.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <DetailGrid columns={2}>
                  <DetailRow
                    label="Reason"
                    value={e.reason}
                    className="sm:col-span-2"
                  />
                  <DetailRow label="Mobile" value={formatPhone(e.phone)} />
                  <DetailRow label="Email" value={e.email} />
                  <DetailRow
                    label="Patient record"
                    value={
                      data.patient ? (
                        <EntityLink
                          href={`/patients/${data.patient.id}`}
                          module="ehr"
                        >
                          {data.patient.uhid}
                        </EntityLink>
                      ) : (
                        "Not registered"
                      )
                    }
                  />
                  <DetailRow label="Department" value={data.department} />
                  <DetailRow
                    label="Preferred doctor"
                    value={data.preferredDoctor ?? "Any"}
                  />
                  <DetailRow label="Assigned to" value={data.assignedTo} />
                  {data.referredBy ? (
                    <DetailRow label="Referred by" value={data.referredBy} />
                  ) : null}
                  <DetailRow
                    label="Next follow-up"
                    value={e.followUpDate ? formatDate(e.followUpDate) : "—"}
                  />
                  {e.cancelReason ? (
                    <DetailRow label="Cancel reason" value={e.cancelReason} />
                  ) : null}
                </DetailGrid>
                {e.notes ? (
                  <DetailRow
                    label="Notes"
                    value={
                      <span className="whitespace-pre-line font-normal">
                        {e.notes}
                      </span>
                    }
                  />
                ) : null}

                {data.appointments.length ? (
                  <div>
                    <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Appointments & billing
                    </p>
                    <ul className="space-y-1.5 text-[0.8125rem]">
                      {data.appointments.map(a => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            <span className="font-mono text-xs">{a.code}</span>{" "}
                            · {formatDateTime(a.scheduledAt)} · {a.doctor}
                            {a.encounterId ? (
                              <>
                                {" · "}
                                <EntityLink
                                  href={`/opd/visits/${a.encounterId}`}
                                  module="opd"
                                >
                                  visit
                                </EntityLink>
                              </>
                            ) : null}
                          </span>
                          <StatusBadge status={a.status} />
                        </li>
                      ))}
                      {data.bills.map(b => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            Bill{" "}
                            <EntityLink
                              href={`/billing/${b.id}`}
                              module="billing"
                              className="font-mono text-xs"
                            >
                              {b.code}
                            </EntityLink>{" "}
                            · {formatINR(b.total)}
                            {b.balance ? ` · ${formatINR(b.balance)} due` : ""}
                          </span>
                          <StatusBadge status={b.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Follow-up history
                  </p>
                  <Timeline
                    entries={data.followUps.map(f => ({
                      id: f.id,
                      at: f.at,
                      title: `${humanize(f.channel)} · ${f.by}`,
                      meta: formatDateTime(f.at),
                      body: `${f.note}${f.nextFollowUpDate ? ` — next on ${formatDate(f.nextFollowUpDate)}` : ""}`,
                      tone: "info",
                    }))}
                    empty="No follow-ups yet."
                  />
                </div>
              </SheetBody>
              {manage && live ? (
                <SheetFooter>
                  <Button
                    variant="ghost"
                    className="text-error-foreground sm:mr-auto"
                    onClick={() => setDialog("cancel")}
                  >
                    Cancel
                  </Button>
                  {convertible ? (
                    <Button
                      variant="outline"
                      onClick={() => setDialog("close")}
                    >
                      Close
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setDialog("edit")}>
                    Edit
                  </Button>
                  {convertible ? (
                    <Button
                      variant="outline"
                      onClick={() => setDialog("reschedule")}
                    >
                      Reschedule
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setDialog("follow")}>
                    Follow-up
                  </Button>
                  {convertible && can("appointment.book") ? (
                    <Button onClick={() => setDialog("convert")}>
                      Book appointment
                    </Button>
                  ) : null}
                </SheetFooter>
              ) : null}
            </>
          )}
        </SheetContent>
      </Sheet>
      {e ? (
        <>
          <EnquiryFormDialog
            open={dialog === "edit"}
            onOpenChange={o => !o && setDialog(null)}
            enquiry={e}
          />
          <FollowUpDialog
            open={dialog === "follow"}
            onOpenChange={o => !o && setDialog(null)}
            enquiryId={e.id}
          />
          <RescheduleFollowUpDialog
            open={dialog === "reschedule"}
            onOpenChange={o => !o && setDialog(null)}
            enquiryId={e.id}
            current={e.followUpDate}
          />
          <ReasonDialog
            open={dialog === "cancel" || dialog === "close"}
            onOpenChange={o => !o && setDialog(null)}
            enquiryId={e.id}
            mode={dialog === "close" ? "close" : "cancel"}
          />
          <BookAppointmentDialog
            open={dialog === "convert"}
            onOpenChange={o => !o && setDialog(null)}
            initialPatient={
              data?.patient
                ? {
                    id: data.patient.id,
                    uhid: data.patient.uhid,
                    name: data.patient.name,
                    phone: data.patient.phone,
                    gender: data.patient.gender,
                    age: data.patient.age,
                  }
                : null
            }
            initialDoctorId={e.preferredDoctorId}
            enquiry={{
              id: e.id,
              code: e.code,
              reason: e.reason,
              departmentId: e.departmentId,
              prospectName: e.prospectName,
              phone: e.phone,
            }}
          />
        </>
      ) : null}
    </>
  );
}
