"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { MoreHorizontal } from "@/components/icons";
import { Field } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MENU_ITEM_DESTRUCTIVE } from "@/components/ui/form-control";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/api/client";
import { formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { isSameDay, isoDate } from "@/lib/sim/time";

import type { QueueRow } from "./api";
import { VitalsDialog } from "./vitals-dialog";

/**
 * Next step for a queue row, by role: the front desk checks in, nurses take
 * vitals, doctors start and open consultations. Secondary actions sit in the
 * overflow menu.
 */
export function QueueActions({
  row,
  onNoShow,
}: {
  row: QueueRow;
  onNoShow: () => void;
}) {
  const router = useRouter();
  const { can } = useSession();
  const [vitalsOpen, setVitalsOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);

  const doCheckIn = useAction(
    "appointment.checkIn",
    () => ({ appointmentId: row.id }),
    {
      success: () => `${row.patient.name} checked in`,
    }
  );
  const doStart = useAction(
    "opd.startConsultation",
    () => ({ appointmentId: row.id }),
    {
      onSuccess: () =>
        row.encounterId && router.push(`/opd/visits/${row.encounterId}`),
    }
  );

  const today = isSameDay(row.scheduledAt, new Date());
  const past = new Date(row.scheduledAt).getTime() < Date.now();

  let primary: React.ReactNode = null;
  if (row.status === "SCHEDULED" && today && can("appointment.checkin")) {
    primary = (
      <Button
        size="sm"
        onClick={() => doCheckIn.mutate()}
        disabled={doCheckIn.isPending}
      >
        Check in
      </Button>
    );
  } else if (row.status === "CHECKED_IN" && can("opd.consult")) {
    primary = (
      <Button
        size="sm"
        onClick={() => doStart.mutate()}
        disabled={doStart.isPending}
      >
        Start consultation
      </Button>
    );
  } else if (
    row.status === "CHECKED_IN" &&
    can("opd.vitals") &&
    !row.vitalsRecorded
  ) {
    primary = (
      <Button size="sm" variant="outline" onClick={() => setVitalsOpen(true)}>
        Record vitals
      </Button>
    );
  } else if (row.encounterId) {
    primary = (
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/opd/visits/${row.encounterId}`)}
      >
        {row.status === "IN_CONSULTATION" && can("opd.consult")
          ? "Continue"
          : "Open"}
      </Button>
    );
  }

  const menu: Array<{
    label: string;
    onSelect: () => void;
    destructive?: boolean;
  }> = [];
  if (row.status === "CHECKED_IN" && can("opd.vitals"))
    menu.push({
      label: row.vitalsRecorded ? "Update vitals" : "Record vitals",
      onSelect: () => setVitalsOpen(true),
    });
  if (row.status === "SCHEDULED" && can("appointment.book"))
    menu.push({ label: "Reschedule", onSelect: () => setRescheduleOpen(true) });
  if (row.status === "SCHEDULED" && past && can("appointment.checkin"))
    menu.push({ label: "Mark no-show", onSelect: onNoShow, destructive: true });
  if (row.status === "SCHEDULED" && can("appointment.book"))
    menu.push({
      label: "Cancel appointment",
      onSelect: () => setCancelOpen(true),
      destructive: true,
    });

  return (
    <div
      className="flex items-center justify-end gap-1"
      onClick={event => event.stopPropagation()}
    >
      {primary}
      {menu.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map(item => (
              <DropdownMenuItem
                key={item.label}
                onSelect={item.onSelect}
                className={item.destructive ? MENU_ITEM_DESTRUCTIVE : undefined}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {row.encounterId ? (
        <VitalsDialog
          open={vitalsOpen}
          onOpenChange={setVitalsOpen}
          encounterId={row.encounterId}
          patientName={`${row.patient.name} · ${row.patient.uhid}`}
        />
      ) : null}
      <CancelAppointmentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        row={row}
      />
      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        row={row}
      />
    </div>
  );
}

function CancelAppointmentDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: QueueRow;
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const cancel = useAction(
    "appointment.cancel",
    (why: string) => ({ appointmentId: row.id, reason: why }),
    {
      success: `Appointment ${row.code} cancelled`,
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel appointment"
      description={`${row.patient.name} · ${formatTime(row.scheduledAt)} with ${row.doctor.name}`}
      size="sm"
      submitLabel="Cancel appointment"
      cancelLabel="Keep"
      isSubmitting={cancel.isPending}
      submitDisabled={!reason.trim()}
      onSubmit={event => {
        event.preventDefault();
        cancel.mutate(reason);
      }}
    >
      <Field label="Reason" required>
        <Input
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Patient requested a later date"
        />
      </Field>
    </FormDialog>
  );
}

function RescheduleDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: QueueRow;
}) {
  const [date, setDate] = React.useState(isoDate(row.scheduledAt));
  const [time, setTime] = React.useState("10:00");
  React.useEffect(() => {
    if (!open) return;
    setDate(isoDate(row.scheduledAt));
    const d = new Date(row.scheduledAt);
    setTime(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    );
  }, [open, row.scheduledAt]);
  const move = useAction(
    "appointment.reschedule",
    (iso: string) => ({ appointmentId: row.id, scheduledAt: iso }),
    {
      success: `Appointment ${row.code} rescheduled`,
      onSuccess: () => onOpenChange(false),
    }
  );
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reschedule appointment"
      description={`${row.patient.name} with ${row.doctor.name}. The doctor's roster and free slots are checked.`}
      size="sm"
      submitLabel="Reschedule"
      isSubmitting={move.isPending}
      onSubmit={event => {
        event.preventDefault();
        const [h, m] = time.split(":").map(Number);
        const [y, mo, d] = date.split("-").map(Number);
        move.mutate(
          new Date(y!, (mo ?? 1) - 1, d ?? 1, h ?? 0, m ?? 0).toISOString()
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input
            type="date"
            min={isoDate(new Date())}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </Field>
        <Field label="Time" hint="15-minute slots">
          <Input
            type="time"
            step={900}
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
