"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight, Copy } from "@/components/icons";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  SelectField,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDepartments } from "@/features/opd/api";
import { useRoster, type RosterCell } from "@/features/wfm/api";
import { useAction } from "@/lib/api/client";
import { formatDateShort } from "@/lib/format";
import { STAFF_ROLE_LABEL } from "@/lib/rbac";
import { useSession } from "@/lib/session";
import type { StaffRole } from "@/lib/sim/schema";
import { addDaysIso, isoDate, startOfWeek } from "@/lib/sim/time";
import { cn } from "@/lib/utils";

const CHIP: Record<string, string> = {
  M: "border-info-border bg-info-surface text-info-foreground",
  E: "border-warning-border bg-warning-surface text-warning-foreground",
  N: "border-border-strong bg-foreground/[0.07] text-foreground",
  G: "border-success-border bg-success-surface text-success-foreground",
  OFF: "border-dashed border-border text-text-disabled",
  LEAVE: "border-error-border bg-error-surface text-error-foreground",
  UNROSTERED: "border-dashed border-border text-text-disabled",
};

const LEGEND = [
  { key: "M", label: "Morning 08–14" },
  { key: "E", label: "Evening 14–20" },
  { key: "N", label: "Night 20–08" },
  { key: "G", label: "General 09–17" },
  { key: "OFF", label: "Off" },
  { key: "LEAVE", label: "Leave" },
];

export default function RosterPage() {
  const { can } = useSession();
  const [weekStart, setWeekStart] = React.useState(() =>
    isoDate(startOfWeek(new Date()))
  );
  const [departmentId, setDepartmentId] = React.useState("");
  const [role, setRole] = React.useState("");
  const [copyOpen, setCopyOpen] = React.useState(false);
  const { data, isLoading, error } = useRoster({
    weekStart,
    departmentId: departmentId || undefined,
    role: role || undefined,
  });
  const { data: departments = [] } = useDepartments();
  const today = isoDate(new Date());
  const manage = can("wfm.manage");

  const copy = useAction(
    "wfm.copyWeek",
    () => ({
      fromWeekStart: weekStart,
      departmentId: departmentId || undefined,
    }),
    {
      success: n => `${n} assignments copied to the following week`,
      onSuccess: () => setWeekStart(addDaysIso(weekStart, 7)),
    }
  );

  const groups = React.useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["rows"]>();
    for (const row of data?.rows ?? [])
      map.set(row.department, [...(map.get(row.department) ?? []), row]);
    return [...map.entries()];
  }, [data]);

  return (
    <PageShell>
      <PageHeader
        title="Duty roster"
        subtitle="Weekly shifts per staff member. OPD booking uses the doctors' roster; 'on duty' everywhere in the app is read from here."
        breadcrumb={[{ label: "WFM", href: "/wfm" }, { label: "Roster" }]}
        actions={
          manage ? (
            <Button variant="outline" onClick={() => setCopyOpen(true)}>
              <Copy className="size-4" />
              Copy week forward
            </Button>
          ) : null
        }
      />
      <ErrorBanner error={error} />

      <Panel
        flush
        title={`Week of ${formatDateShort(weekStart)} – ${formatDateShort(addDaysIso(weekStart, 6))}`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                aria-label="Previous week"
                onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setWeekStart(isoDate(startOfWeek(new Date())))}
              >
                This week
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Next week"
                onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <SelectField
              className="w-full sm:w-52"
              aria-label="Department"
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              className="w-full sm:w-44"
              aria-label="Role"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="">All roles</option>
              {(
                [
                  "DOCTOR",
                  "NURSE",
                  "PHARMACIST",
                  "LAB_TECHNICIAN",
                  "RECEPTIONIST",
                  "BILLING_EXECUTIVE",
                  "MRD_STAFF",
                  "OPERATIONS_MANAGER",
                  "ADMINISTRATOR",
                  "SUPPORT",
                ] as StaffRole[]
              ).map(r => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABEL[r]}
                </option>
              ))}
            </SelectField>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2 text-xs">
          {LEGEND.map(l => (
            <span
              key={l.key}
              className="inline-flex items-center gap-1.5 text-muted-foreground"
            >
              <span
                className={cn(
                  "inline-flex h-5 min-w-6 items-center justify-center rounded border px-1 text-[0.625rem] font-semibold",
                  CHIP[l.key]
                )}
              >
                {l.key === "OFF" ? "—" : l.key === "LEAVE" ? "L" : l.key}
              </span>
              {l.label}
            </span>
          ))}
        </div>
        {isLoading || !data ? (
          <div className="p-3">
            <PanelRowsSkeleton rows={10} />
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-subtle">
                  <th className="sticky left-0 z-10 h-10 w-64 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Staff
                  </th>
                  {data.days.map(d => (
                    <th
                      key={d}
                      className={cn(
                        "px-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                        d === today && "text-primary"
                      )}
                    >
                      {new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
                        weekday: "short",
                      })}
                      <span className="block text-[0.6875rem] font-medium normal-case tracking-normal">
                        {formatDateShort(d)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border bg-surface-subtle/60">
                  <td className="sticky left-0 z-10 bg-surface-subtle px-4 py-2 text-xs font-medium text-muted-foreground">
                    Coverage (M / E / N / G)
                  </td>
                  {data.coverage.map(c => (
                    <td
                      key={c.date}
                      className="px-2 py-2 text-center text-xs tabular-nums text-muted-foreground"
                    >
                      {c.M} / {c.E} / {c.N} / {c.G}
                      {c.leave ? (
                        <span className="block text-error-foreground">
                          {c.leave} on leave
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
                {groups.map(([department, rows]) => (
                  <React.Fragment key={department}>
                    <tr className="border-b border-border">
                      <td
                        colSpan={8}
                        className="bg-card px-4 pb-1 pt-3 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                      >
                        {department}
                      </td>
                    </tr>
                    {rows.map(row => (
                      <tr
                        key={row.id}
                        className="border-b border-border/70 last:border-0 hover:bg-surface-subtle/60"
                      >
                        <td className="sticky left-0 z-10 bg-card px-4 py-1.5">
                          <p className="truncate text-[0.8125rem] font-medium">
                            {row.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.designation}
                          </p>
                        </td>
                        {row.cells.map(cell => (
                          <td
                            key={cell.date}
                            className={cn(
                              "px-1.5 py-1.5 text-center",
                              cell.date === today && "bg-primary-surface/40"
                            )}
                          >
                            <ShiftCell
                              staffId={row.id}
                              staffName={row.name}
                              cell={cell}
                              editable={manage}
                              shifts={data.shifts}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmationDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        title="Copy this week forward?"
        description={`Shifts for the week of ${formatDateShort(weekStart)}${departmentId ? " (selected department)" : ""} are copied onto the following week. Leave days become days off.`}
        confirmText="Copy week"
        onConfirm={async () => {
          await copy.mutateAsync();
        }}
      />
    </PageShell>
  );
}

function ShiftCell({
  staffId,
  staffName,
  cell,
  editable,
  shifts,
}: {
  staffId: string;
  staffName: string;
  cell: RosterCell;
  editable: boolean;
  shifts: Array<{
    id: string;
    code: string;
    name: string;
    start: string;
    end: string;
  }>;
}) {
  const save = useAction(
    "wfm.setRoster",
    (v: { status: "SCHEDULED" | "OFF" | "LEAVE"; shiftId?: string }) => ({
      staffId,
      date: cell.date,
      status: v.status,
      shiftId: v.shiftId,
    }),
    { success: `Roster updated for ${staffName}` }
  );
  const key =
    cell.status === "SCHEDULED" ? (cell.shiftCode ?? "G") : cell.status;
  const label =
    cell.status === "SCHEDULED"
      ? cell.shiftCode
      : cell.status === "LEAVE"
        ? "Leave"
        : cell.status === "OFF"
          ? "Off"
          : "—";
  const chip = (
    <span
      className={cn(
        "inline-flex h-7 w-full min-w-10 items-center justify-center rounded-md border text-xs font-semibold",
        CHIP[key]
      )}
      title={cell.note}
    >
      {label}
    </span>
  );
  if (!editable) return chip;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label={`${staffName} on ${cell.date}: ${label}. Change shift`}
        >
          {chip}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        <DropdownMenuLabel>{formatDateShort(cell.date)}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {shifts.map(s => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => save.mutate({ status: "SCHEDULED", shiftId: s.id })}
          >
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded border text-[0.625rem] font-bold",
                CHIP[s.code]
              )}
            >
              {s.code}
            </span>
            {s.name} · {s.start}–{s.end}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => save.mutate({ status: "OFF" })}>
          Day off
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => save.mutate({ status: "LEAVE" })}>
          Leave
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
