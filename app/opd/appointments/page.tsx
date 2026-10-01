"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Plus } from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PatientCell, RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import {
  useAppointments,
  useDoctorOptions,
  type QueueRow,
} from "@/features/opd/api";
import { BookAppointmentDialog } from "@/features/opd/booking-dialogs";
import { QueueActions } from "@/features/opd/queue-actions";
import { useAction } from "@/lib/api/client";
import { formatDateShort, formatTime, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import { APPOINTMENT_STATUSES } from "@/lib/sim/schema";
import { addDays, isoDate } from "@/lib/sim/time";

type Range = "today" | "tomorrow" | "week" | "past";

function rangeFor(range: Range) {
  const today = new Date();
  switch (range) {
    case "today":
      return { from: isoDate(today), to: isoDate(today) };
    case "tomorrow":
      return {
        from: isoDate(addDays(today, 1)),
        to: isoDate(addDays(today, 1)),
      };
    case "week":
      return { from: isoDate(today), to: isoDate(addDays(today, 7)) };
    case "past":
      return {
        from: isoDate(addDays(today, -7)),
        to: isoDate(addDays(today, -1)),
      };
  }
}

export default function AppointmentsPage() {
  return (
    <React.Suspense>
      <Appointments />
    </React.Suspense>
  );
}

function Appointments() {
  const router = useRouter();
  const params = useSearchParams();
  const { staff, can } = useSession();
  const doctor = staff?.role === "DOCTOR";
  const [range, setRange] = React.useState<Range>("today");
  const [doctorId, setDoctorId] = React.useState(
    doctor && staff ? staff.id : ""
  );
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [bookOpen, setBookOpen] = React.useState(false);

  // A search looks a month either side; otherwise the preset range applies.
  const effective = q.trim()
    ? {
        from: isoDate(addDays(new Date(), -30)),
        to: isoDate(addDays(new Date(), 30)),
      }
    : rangeFor(range);
  const {
    data: rows = [],
    isLoading,
    error,
  } = useAppointments({
    ...effective,
    doctorId: doctorId || undefined,
    status: status || undefined,
    q: q || undefined,
  });
  const { data: doctors = [] } = useDoctorOptions(isoDate(new Date()));
  const noShow = useAction(
    "appointment.noShow",
    (id: string) => ({ appointmentId: id }),
    { success: "Marked as no-show" }
  );

  const multiDay = effective.from !== effective.to;
  const columns: Column<QueueRow>[] = [
    {
      id: "when",
      header: multiDay ? "Date & time" : "Time",
      sortValue: r => r.scheduledAt,
      cell: r => (
        <span className="tabular-nums">
          {multiDay ? `${formatDateShort(r.scheduledAt)}, ` : ""}
          {formatTime(r.scheduledAt)}
        </span>
      ),
    },
    {
      id: "patient",
      header: "Patient",
      sortValue: r => r.patient.name,
      cell: r => <PatientCell patient={r.patient} showPhone />,
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
      cell: r => <span className="line-clamp-1 max-w-64">{r.reason}</span>,
    },
    {
      id: "type",
      header: "Type",
      sortValue: r => r.type,
      cell: r => humanize(r.type),
    },
    {
      id: "source",
      header: "Booked via",
      sortValue: r => r.source,
      cell: r => humanize(r.source),
    },
    { id: "code", header: "Ref", cell: r => <RefCode>{r.code}</RefCode> },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => <StatusBadge status={r.status} />,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: r => <QueueActions row={r} onNoShow={() => noShow.mutate(r.id)} />,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Appointments"
        subtitle="The OPD appointment book across doctors. Slots follow the WFM roster."
        breadcrumb={[{ label: "OPD", href: "/opd" }, { label: "Appointments" }]}
        actions={
          can("appointment.book") ? (
            <Button onClick={() => setBookOpen(true)}>
              <Plus className="size-4" />
              Book appointment
            </Button>
          ) : null
        }
      />
      <ErrorBanner error={error} />
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{
            id: "when",
            direction: range === "past" ? "desc" : "asc",
          }}
          empty="No appointments match these filters."
          onRowClick={r =>
            r.encounterId && router.push(`/opd/visits/${r.encounterId}`)
          }
          toolbar={
            <>
              <CategorySwitcher
                label="Date range"
                value={range}
                onValueChange={next => {
                  setRange(next);
                  setQ("");
                }}
                items={[
                  { value: "today", label: "Today" },
                  { value: "tomorrow", label: "Tomorrow" },
                  { value: "week", label: "Next 7 days" },
                  { value: "past", label: "Past 7 days" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Search ±30 days: patient, UHID, phone, APT no."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-52"
                aria-label="Doctor"
                value={doctorId}
                onChange={e => setDoctorId(e.target.value)}
              >
                <option value="">All doctors</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                className="w-full sm:w-44"
                aria-label="Status"
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {APPOINTMENT_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </SelectField>
            </>
          }
        />
      </Panel>
      <BookAppointmentDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        initialDoctorId={doctor ? staff?.id : undefined}
      />
    </PageShell>
  );
}
