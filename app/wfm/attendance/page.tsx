"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  UserCheck,
  UsersThree,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Textarea } from "@/components/ui/textarea";
import { useDepartments } from "@/features/opd/api";
import {
  useAttendance,
  type AttendanceDisplayStatus,
  type AttendanceRow,
} from "@/features/wfm/api";
import { useAction } from "@/lib/api/client";
import { formatDate, formatTime } from "@/lib/format";
import { STAFF_ROLE_LABEL } from "@/lib/rbac";
import { useSession } from "@/lib/session";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/sim/schema";
import { addDaysIso, isoDate } from "@/lib/sim/time";

const DISPLAY_STATUSES: AttendanceDisplayStatus[] = [
  "PRESENT",
  "LATE",
  "HALF_DAY",
  "ABSENT",
  "LEAVE",
  "OFF_DUTY",
  "NOT_MARKED",
];

export default function AttendancePage() {
  return (
    <React.Suspense>
      <AttendanceContent />
    </React.Suspense>
  );
}

function AttendanceContent() {
  const params = useSearchParams();
  const { can } = useSession();
  const today = isoDate(new Date());
  const staffId = params.get("staff") || undefined;
  const [date, setDate] = React.useState(today);
  const [q, setQ] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [selected, setSelected] = React.useState<AttendanceRow | null>(null);
  const { data, isLoading, error } = useAttendance({
    date,
    q: q || undefined,
    departmentId: departmentId || undefined,
    status: status || undefined,
    staffId,
  });
  const { data: departments = [] } = useDepartments();
  const manage = can("wfm.manage");

  const columns = React.useMemo<Column<AttendanceRow>[]>(
    () => [
      {
        id: "staff",
        header: "Staff",
        sortValue: row => row.name,
        cell: row => (
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            <RefCode className="mt-0.5">{row.staffCode}</RefCode>
          </div>
        ),
      },
      {
        id: "role",
        header: "Role",
        sortValue: row => STAFF_ROLE_LABEL[row.role],
        cell: row => (
          <div>
            <p>{STAFF_ROLE_LABEL[row.role]}</p>
            <p className="text-xs text-muted-foreground">{row.designation}</p>
          </div>
        ),
      },
      {
        id: "department",
        header: "Department",
        sortValue: row => row.department,
        cell: row => row.department,
      },
      {
        id: "roster",
        header: "Roster",
        cell: row =>
          row.rosterStatus === "SCHEDULED" ? (
            <div>
              <p className="font-medium">{row.shift ?? "Scheduled"}</p>
              <p className="text-xs text-muted-foreground">{row.shiftWindow}</p>
            </div>
          ) : (
            <StatusBadge status={row.rosterStatus} />
          ),
      },
      {
        id: "attendance",
        header: "Attendance",
        sortValue: row => row.status,
        cell: row => <StatusBadge status={row.status} />,
      },
      {
        id: "times",
        header: "Check-in / out",
        cell: row => (
          <span className="whitespace-nowrap tabular-nums">
            {formatTime(row.checkInAt)} · {formatTime(row.checkOutAt)}
          </span>
        ),
      },
      {
        id: "note",
        header: "Note",
        defaultHidden: true,
        cell: row => row.note || "—",
      },
      {
        id: "recordedBy",
        header: "Recorded by",
        defaultHidden: true,
        cell: row => row.recordedBy || "—",
      },
      ...(manage
        ? [
            {
              id: "action",
              header: "",
              align: "right" as const,
              cell: (row: AttendanceRow) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={event => {
                    event.stopPropagation();
                    setSelected(row);
                  }}
                >
                  {row.status === "NOT_MARKED" ? "Mark" : "Update"}
                </Button>
              ),
            },
          ]
        : []),
    ],
    [manage]
  );

  return (
    <PageShell>
      <PageHeader
        title="Staff attendance"
        subtitle="Track daily attendance against the duty roster, including arrival and departure times."
        breadcrumb={[{ label: "WFM", href: "/wfm" }, { label: "Attendance" }]}
        actions={
          <Button variant="outline" asChild>
            <Link href="/wfm/roster">
              <CalendarDays className="size-4" />
              View roster
            </Link>
          </Button>
        }
      />
      <ErrorBanner error={error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Active staff"
          value={data?.summary.total ?? 0}
          hint={formatDate(date)}
          tone="info"
          icon={UsersThree}
          loading={isLoading}
        />
        <StatCard
          label="Present"
          value={data?.summary.present ?? 0}
          hint={`${data?.summary.late ?? 0} late`}
          tone="positive"
          icon={UserCheck}
          loading={isLoading}
        />
        <StatCard
          label="Late / half day"
          value={(data?.summary.late ?? 0) + (data?.summary.halfDay ?? 0)}
          hint={`${data?.summary.halfDay ?? 0} half day`}
          tone="warning"
          icon={Clock}
          loading={isLoading}
        />
        <StatCard
          label="Absent"
          value={data?.summary.absent ?? 0}
          hint={`${data?.summary.leave ?? 0} leave · ${data?.summary.offDuty ?? 0} off`}
          tone="critical"
          icon={UsersThree}
          loading={isLoading}
        />
        <StatCard
          label="Not marked"
          value={data?.summary.notMarked ?? 0}
          hint="Awaiting attendance"
          tone="neutral"
          icon={Clock}
          loading={isLoading}
        />
      </div>

      <Panel
        flush
        title={`Attendance · ${formatDate(date)}`}
        description={
          manage
            ? "Select a staff member or use Update to record attendance."
            : "Attendance is read-only for your role."
        }
      >
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          keyOf={row => row.staffId}
          isLoading={isLoading}
          pageSize={15}
          empty="No staff match these attendance filters."
          onRowClick={manage ? setSelected : undefined}
          toolbar={
            <>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Previous day"
                  onClick={() => setDate(addDaysIso(date, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Input
                  type="date"
                  value={date}
                  max={today}
                  onChange={event => setDate(event.target.value)}
                  className="w-40"
                  aria-label="Attendance date"
                />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Next day"
                  disabled={date >= today}
                  onClick={() => setDate(addDaysIso(date, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <SearchInput
                value={q}
                onChange={event => setQ(event.target.value)}
                placeholder="Search staff…"
                className="w-full sm:w-56"
              />
              {!staffId ? (
                <SelectField
                  value={departmentId}
                  onChange={event => setDepartmentId(event.target.value)}
                  aria-label="Department"
                  className="w-full sm:w-48"
                >
                  <option value="">All departments</option>
                  {departments.map(department => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <SelectField
                value={status}
                onChange={event => setStatus(event.target.value)}
                aria-label="Attendance status"
                className="w-full sm:w-44"
              >
                <option value="">All statuses</option>
                {DISPLAY_STATUSES.map(value => (
                  <option key={value} value={value}>
                    {value
                      .toLowerCase()
                      .replaceAll("_", " ")
                      .replace(/^./, char => char.toUpperCase())}
                  </option>
                ))}
              </SelectField>
              {staffId ? (
                <Button variant="ghost" asChild>
                  <Link href="/wfm/attendance">Show all staff</Link>
                </Button>
              ) : null}
            </>
          }
        />
      </Panel>

      <AttendanceDialog
        row={selected}
        date={date}
        onOpenChange={open => !open && setSelected(null)}
      />
    </PageShell>
  );
}

function localTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toInstant(date: string, time: string, nextDay = false) {
  if (!time) return undefined;
  const day = nextDay ? addDaysIso(date, 1) : date;
  return new Date(`${day}T${time}:00`).toISOString();
}

function AttendanceDialog({
  row,
  date,
  onOpenChange,
}: {
  row: AttendanceRow | null;
  date: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = React.useState<AttendanceStatus>("PRESENT");
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (!row) return;
    setStatus(row.status === "NOT_MARKED" ? "PRESENT" : row.status);
    setCheckIn(localTime(row.checkInAt));
    setCheckOut(localTime(row.checkOutAt));
    setNote(row.note ?? "");
  }, [row]);

  const save = useAction(
    "wfm.setAttendance",
    () => {
      const timed = ["PRESENT", "LATE", "HALF_DAY"].includes(status);
      const overnight = Boolean(checkIn && checkOut && checkOut <= checkIn);
      return {
        staffId: row!.staffId,
        date,
        status,
        checkInAt: timed ? toInstant(date, checkIn) : undefined,
        checkOutAt: timed ? toInstant(date, checkOut, overnight) : undefined,
        note,
      };
    },
    {
      success: () => `Attendance updated for ${row?.name ?? "staff member"}`,
      onSuccess: () => onOpenChange(false),
    }
  );
  const timed = ["PRESENT", "LATE", "HALF_DAY"].includes(status);

  return (
    <FormDialog
      open={Boolean(row)}
      onOpenChange={onOpenChange}
      title={row ? `Attendance · ${row.name}` : "Attendance"}
      description={`${formatDate(date)}${row?.shift ? ` · ${row.shift} ${row.shiftWindow ?? ""}` : " · Not scheduled"}`}
      size="sm"
      submitLabel="Save attendance"
      isSubmitting={save.isPending}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Status" required>
        <SelectField
          value={status}
          onChange={event => setStatus(event.target.value as AttendanceStatus)}
        >
          {ATTENDANCE_STATUSES.map(value => (
            <option key={value} value={value}>
              {value
                .toLowerCase()
                .replaceAll("_", " ")
                .replace(/^./, char => char.toUpperCase())}
            </option>
          ))}
        </SelectField>
      </Field>
      {timed ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in time">
            <Input
              type="time"
              value={checkIn}
              onChange={event => setCheckIn(event.target.value)}
            />
          </Field>
          <Field
            label="Check-out time"
            hint={
              checkIn && checkOut && checkOut <= checkIn
                ? "Treated as next day"
                : undefined
            }
          >
            <Input
              type="time"
              value={checkOut}
              onChange={event => setCheckOut(event.target.value)}
            />
          </Field>
        </div>
      ) : null}
      <Field
        label="Note"
        hint="Optional reason, exception, or handover detail."
      >
        <Textarea
          value={note}
          maxLength={500}
          onChange={event => setNote(event.target.value)}
          placeholder="Add context for this attendance record"
        />
      </Field>
    </FormDialog>
  );
}
