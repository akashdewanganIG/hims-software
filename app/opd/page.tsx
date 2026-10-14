"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  CalendarCheck,
  Clock,
  Hourglass,
  Plus,
  QueueIcon,
  Stethoscope,
  UserCheck,
  UserPlus,
  Users,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PatientCell, RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useOpdDashboard, type QueueRow } from "@/features/opd/api";
import {
  BookAppointmentDialog,
  WalkInDialog,
} from "@/features/opd/booking-dialogs";
import { QueueActions } from "@/features/opd/queue-actions";
import { useAction } from "@/lib/api/client";
import { formatDuration, formatTime, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Tab = "waiting" | "consultation" | "upcoming" | "completed" | "all";

/** Doctor cards wear their load: busy (over 3 waiting), consulting, on duty, off. */
type DoctorTone = "busy" | "consulting" | "onDuty" | "offShift";
const DOCTOR_CARD: Record<DoctorTone, string> = {
  busy: "border-warning-border bg-warning-surface",
  consulting: "border-info-border bg-info-surface",
  onDuty: "border-success-border bg-success-surface",
  offShift: "border-border bg-surface-subtle",
};
const DOCTOR_TEXT: Record<DoctorTone, string> = {
  busy: "text-warning-foreground",
  consulting: "text-info-foreground",
  onDuty: "text-success-foreground",
  offShift: "text-muted-foreground",
};

const TAB_FILTER: Record<Tab, (row: QueueRow) => boolean> = {
  waiting: r => r.status === "CHECKED_IN",
  consultation: r => r.status === "IN_CONSULTATION",
  upcoming: r => r.status === "SCHEDULED",
  completed: r => r.status === "COMPLETED",
  all: () => true,
};

export default function OpdQueuePage() {
  const router = useRouter();
  const { staff, can } = useSession();
  const doctor = staff?.role === "DOCTOR";
  const [doctorId, setDoctorId] = React.useState<string>(() =>
    doctor && staff ? staff.id : ""
  );
  const [tab, setTab] = React.useState<Tab>("waiting");
  const [bookOpen, setBookOpen] = React.useState(false);
  const [walkInOpen, setWalkInOpen] = React.useState(false);
  const [noShow, setNoShow] = React.useState<QueueRow | null>(null);

  const { data, isLoading, error } = useOpdDashboard({
    doctorId: doctorId || undefined,
  });
  const rows = data?.rows ?? [];
  const counts = data?.counts;
  const visible = rows.filter(TAB_FILTER[tab]);

  const columns: Column<QueueRow>[] = [
    {
      id: "token",
      header: "Token",
      width: "4.5rem",
      sortValue: r => r.tokenNumber ?? 999,
      cell: r =>
        r.tokenNumber ? (
          <span className="inline-flex h-6 min-w-8 items-center justify-center rounded-md bg-secondary px-1.5 text-xs font-semibold tabular-nums">
            {r.tokenNumber}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "time",
      header: "Slot",
      sortValue: r => r.scheduledAt,
      cell: r => (
        <span className="tabular-nums">{formatTime(r.scheduledAt)}</span>
      ),
    },
    {
      id: "patient",
      header: "Patient",
      sortValue: r => r.patient.name,
      cell: r => <PatientCell patient={r.patient} />,
    },
    {
      id: "doctor",
      header: "Doctor",
      sortValue: r => r.doctor.name,
      cell: r => (
        <div className="min-w-0">
          <p className="truncate">{r.doctor.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {r.department}
          </p>
        </div>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: r => (
        <div className="min-w-0 max-w-52">
          <p className="truncate">{r.reason}</p>
          <p className="truncate text-xs text-muted-foreground">
            {humanize(r.type)} · {humanize(r.source)}
          </p>
        </div>
      ),
    },
    {
      id: "wait",
      header: "Wait",
      align: "right",
      sortValue: r => r.waitMinutes ?? -1,
      cell: r =>
        r.waitMinutes === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              "tabular-nums",
              r.status === "CHECKED_IN" &&
                r.waitMinutes > 30 &&
                "font-semibold text-error-foreground"
            )}
          >
            {formatDuration(r.waitMinutes)}
          </span>
        ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      // Vitals ride along under the status, keeping the queue narrow.
      cell: r => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge status={r.status} />
          {r.encounterId ? (
            <span
              className={cn(
                "text-[0.6875rem] font-medium",
                r.vitalsRecorded
                  ? "text-success-foreground"
                  : "text-warning-foreground"
              )}
            >
              {r.vitalsRecorded ? "Vitals done" : "Vitals due"}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "code",
      header: "Ref",
      defaultHidden: true,
      cell: r => <RefCode>{r.code}</RefCode>,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: r => <QueueActions row={r} onNoShow={() => setNoShow(r)} />,
    },
  ];

  const tabs = [
    { value: "waiting" as const, label: "Waiting", count: counts?.CHECKED_IN },
    {
      value: "consultation" as const,
      label: "In consultation",
      count: counts?.IN_CONSULTATION,
    },
    { value: "upcoming" as const, label: "Upcoming", count: counts?.SCHEDULED },
    {
      value: "completed" as const,
      label: "Completed",
      count: counts?.COMPLETED,
    },
    { value: "all" as const, label: "All today", count: rows.length },
  ];

  return (
    <PageShell>
      <PageHeader
        title="OPD queue"
        subtitle="Today's outpatient flow: check-in, vitals, consultation and visit closure."
        actions={
          <>
            <SelectField
              className="w-full sm:w-60"
              aria-label="Filter by doctor"
              value={doctorId}
              onChange={e => setDoctorId(e.target.value)}
            >
              <option value="">All doctors</option>
              {(data?.doctors ?? []).map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
            <Button asChild variant="outline">
              <a href="/opd/display" target="_blank" rel="noreferrer">
                <QueueIcon className="size-4" />
                Token display
              </a>
            </Button>
            {can("appointment.checkin") ? (
              <Button variant="outline" onClick={() => setWalkInOpen(true)}>
                <UserPlus className="size-4" />
                Walk-in
              </Button>
            ) : null}
            {can("appointment.book") ? (
              <Button onClick={() => setBookOpen(true)}>
                <Plus className="size-4" />
                Book appointment
              </Button>
            ) : null}
          </>
        }
      />

      <ErrorBanner error={error} />

      <section
        aria-label="Today at a glance"
        className="grid-auto-fit-sm gap-3"
      >
        <StatCard
          label="Booked today"
          value={rows.filter(r => r.status !== "CANCELLED").length}
          icon={CalendarCheck}
          loading={isLoading}
          hint={`${counts?.CANCELLED ?? 0} cancelled`}
        />
        <StatCard
          label="Waiting"
          value={counts?.CHECKED_IN ?? 0}
          icon={Users}
          loading={isLoading}
          tone={(data?.longestWaiting ?? 0) > 30 ? "warning" : "neutral"}
          hint={
            data?.longestWaiting !== null && data?.longestWaiting !== undefined
              ? `Longest ${formatDuration(data.longestWaiting)}`
              : "Nobody waiting"
          }
        />
        <StatCard
          label="In consultation"
          value={counts?.IN_CONSULTATION ?? 0}
          icon={Stethoscope}
          loading={isLoading}
          tone={counts?.IN_CONSULTATION ? "info" : "neutral"}
        />
        <StatCard
          label="Completed"
          value={counts?.COMPLETED ?? 0}
          icon={UserCheck}
          loading={isLoading}
          tone={counts?.COMPLETED ? "positive" : "neutral"}
        />
        <StatCard
          label="Average wait"
          value={
            data?.averageWait !== null && data?.averageWait !== undefined
              ? formatDuration(data.averageWait)
              : "—"
          }
          icon={Hourglass}
          loading={isLoading}
          hint="Check-in to consultation"
        />
        <StatCard
          label="No-shows"
          value={counts?.NO_SHOW ?? 0}
          icon={Clock}
          loading={isLoading}
        />
      </section>

      <Panel
        title="Doctors today"
        description="Live load per doctor. Select a card to show only that doctor's patients in the queue."
        actions={
          doctorId ? (
            <Button size="sm" variant="outline" onClick={() => setDoctorId("")}>
              Show all doctors
            </Button>
          ) : null
        }
      >
        {isLoading ? (
          <PanelRowsSkeleton rows={2} />
        ) : data?.doctors.length ? (
          <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,13.5rem),1fr))]">
            {data.doctors.map(d => {
              const selected = doctorId === d.id;
              const tone: DoctorTone =
                d.waiting > 3
                  ? "busy"
                  : d.inConsultation
                    ? "consulting"
                    : d.onDuty
                      ? "onDuty"
                      : "offShift";
              return (
                <li key={d.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDoctorId(selected ? "" : d.id)}
                    className={cn(
                      "flex h-full w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30",
                      DOCTOR_CARD[tone],
                      selected &&
                        "ring-2 ring-primary ring-offset-1 ring-offset-card"
                    )}
                  >
                    <Stethoscope
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        DOCTOR_TEXT[tone]
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold text-foreground">
                        {d.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.department}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block text-xs font-medium",
                          DOCTOR_TEXT[tone]
                        )}
                      >
                        {d.inConsultation
                          ? "Consulting"
                          : d.onDuty
                            ? "On duty"
                            : "Off shift"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={cn(
                          "block text-lg font-semibold leading-none tabular-nums",
                          tone === "busy" && DOCTOR_TEXT.busy
                        )}
                      >
                        {d.waiting}
                      </span>
                      <span className="block text-[0.6875rem] text-muted-foreground">
                        waiting
                      </span>
                      <span className="mt-1 block text-[0.6875rem] tabular-nums text-muted-foreground">
                        {d.seen}/{d.booked} seen
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No OPD bookings today.
          </p>
        )}
      </Panel>

      <Panel
        flush
        title="Today's queue"
        description="Patients are seen in token order. Waits over 30 minutes are highlighted."
      >
        <DataTable
          columns={columns}
          rows={visible}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={
            tab === "upcoming" || tab === "all"
              ? { id: "time", direction: "asc" }
              : { id: "token", direction: "asc" }
          }
          empty={
            tab === "waiting"
              ? "No one is waiting right now."
              : "No patients in this view."
          }
          onRowClick={r =>
            r.encounterId && router.push(`/opd/visits/${r.encounterId}`)
          }
          pageSize={15}
          toolbar={
            <CategorySwitcher
              label="Queue view"
              items={tabs}
              value={tab}
              onValueChange={setTab}
            />
          }
        />
      </Panel>

      <BookAppointmentDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        initialDoctorId={doctor ? staff?.id : undefined}
      />
      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} />
      <NoShowConfirm row={noShow} onClose={() => setNoShow(null)} />
    </PageShell>
  );
}

function NoShowConfirm({
  row,
  onClose,
}: {
  row: QueueRow | null;
  onClose: () => void;
}) {
  const markNoShow = useNoShow();
  return (
    <ConfirmationDialog
      open={Boolean(row)}
      onOpenChange={open => !open && onClose()}
      variant="destructive"
      title="Mark as no-show?"
      description={
        row
          ? `${row.patient.name} did not arrive for the ${formatTime(row.scheduledAt)} slot with ${row.doctor.name}. A linked enquiry goes back to follow-up.`
          : ""
      }
      confirmText="Mark no-show"
      onConfirm={async () => {
        if (row) await markNoShow.mutateAsync(row.id);
      }}
    />
  );
}

function useNoShow() {
  return useAction(
    "appointment.noShow",
    (id: string) => ({ appointmentId: id }),
    { success: "Marked as no-show" }
  );
}
