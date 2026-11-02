"use client";

import * as React from "react";
import { CalendarDays } from "@/components/icons";
import {
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatusBadge,
} from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import {
  useRadiologyCatalog,
  useRadiologySchedule,
  useRadiologyWorklist,
} from "@/features/radiology/api";
import { useAction } from "@/lib/api/client";
import { formatDateTime, humanize } from "@/lib/format";
import { isoDate } from "@/lib/sim/time";

export default function RadiologySchedulePage() {
  const [date, setDate] = React.useState(() => isoDate(new Date()));
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const { data: lanes = [], error } = useRadiologySchedule(date);
  const { data: waiting = [] } = useRadiologyWorklist({ stage: "waiting" });
  return (
    <PageShell>
      <PageHeader
        title="Imaging schedule"
        subtitle="Resource-aware daily schedule by modality room and equipment."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays className="size-4" />
            <input
              type="date"
              className="h-9 rounded-md border border-border bg-surface px-3"
              value={date}
              onChange={event => setDate(event.target.value)}
            />
          </label>
        }
      />
      <ErrorBanner error={error} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-3 md:grid-cols-2">
          {lanes.map(lane => (
            <Panel
              key={lane.equipment.id}
              title={lane.equipment.name}
              description={`${humanize(lane.equipment.modality)} · ${lane.equipment.room}`}
              actions={<StatusBadge status={lane.equipment.status} />}
            >
              <div className="space-y-2">
                {lane.orders.map(order => (
                  <a
                    key={order.id}
                    href={`/radiology/studies/${order.id}`}
                    className="block rounded-lg border border-border p-3 hover:bg-secondary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">
                        {formatDateTime(order.scheduledAt)}
                      </p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm">{order.patient.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.procedure} · {order.accessionNumber}
                    </p>
                  </a>
                ))}
                {!lane.orders.length ? (
                  <p className="py-5 text-center text-sm text-muted-foreground">
                    No studies scheduled.
                  </p>
                ) : null}
              </div>
            </Panel>
          ))}
        </div>
        <Panel
          title={`Unscheduled · ${waiting.filter(row => !row.scheduledAt).length}`}
          description="Select an order to assign equipment and time."
        >
          <div className="space-y-2">
            {waiting
              .filter(row => !row.scheduledAt)
              .map(row => (
                <button
                  key={row.id}
                  className="w-full rounded-lg border border-border p-3 text-left hover:bg-secondary"
                  onClick={() => setOrderId(row.id)}
                >
                  <p className="font-medium">{row.patient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.procedure} · {row.accessionNumber}
                  </p>
                </button>
              ))}
          </div>
        </Panel>
      </div>
      <ScheduleDialog orderId={orderId} onClose={() => setOrderId(null)} />
    </PageShell>
  );
}

function ScheduleDialog({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { data: catalog } = useRadiologyCatalog();
  const { data: waiting = [] } = useRadiologyWorklist({ stage: "waiting" });
  const row = waiting.find(item => item.id === orderId);
  const [equipmentId, setEquipmentId] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  React.useEffect(() => {
    setEquipmentId("");
    setScheduledAt("");
  }, [orderId]);
  const equipment =
    catalog?.equipment.filter(
      item => item.modality === row?.modality && item.status === "ACTIVE"
    ) ?? [];
  const save = useAction(
    "radiology.schedule",
    () => ({
      orderId: orderId!,
      equipmentId,
      scheduledAt: new Date(scheduledAt).toISOString(),
    }),
    { success: "Imaging study scheduled", onSuccess: onClose }
  );
  return (
    <FormDialog
      open={Boolean(orderId)}
      onOpenChange={open => !open && onClose()}
      title="Schedule imaging study"
      submitLabel="Schedule"
      isSubmitting={save.isPending}
      submitDisabled={!equipmentId || !scheduledAt}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        {row ? `${row.patient.name} · ${row.procedure}` : ""}
      </p>
      <Field label="Equipment" required>
        <SelectField
          value={equipmentId}
          onChange={event => setEquipmentId(event.target.value)}
        >
          <option value="">Choose…</option>
          {equipment.map(item => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.room}
            </option>
          ))}
        </SelectField>
      </Field>
      <Field label="Date and time" required>
        <input
          type="datetime-local"
          className="h-9 w-full rounded-md border border-border bg-surface px-3"
          value={scheduledAt}
          onChange={event => setScheduledAt(event.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
