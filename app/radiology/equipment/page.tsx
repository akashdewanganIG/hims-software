"use client";

import * as React from "react";
import { Wrench } from "@/components/icons";
import {
  DetailGrid,
  DetailRow,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { useRadiologyEquipment } from "@/features/radiology/api";
import { useAction } from "@/lib/api/client";
import { formatDateShort, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function EquipmentPage() {
  const { can } = useSession();
  const { data: equipment = [] } = useRadiologyEquipment();
  const [selected, setSelected] = React.useState<string | null>(null);
  return (
    <PageShell>
      <PageHeader
        title="Equipment, AERB & quality"
        subtitle="Modality availability, statutory licence dates, QA, maintenance and downtime."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {equipment.map(item => (
          <Panel
            key={item.id}
            title={item.name}
            description={`${humanize(item.modality)} · ${item.room}`}
            actions={<StatusBadge status={item.status} />}
          >
            <DetailGrid columns={2}>
              <DetailRow label="Equipment code" value={item.code} />
              <DetailRow
                label="Make / model"
                value={`${item.manufacturer} ${item.model}`}
              />
              <DetailRow
                label="AERB licence"
                value={item.aerbLicenceNumber ?? "Non-ionising modality"}
              />
              <DetailRow
                label="Licence valid until"
                value={
                  item.aerbLicenceValidUntil
                    ? formatDateShort(item.aerbLicenceValidUntil)
                    : "Not applicable"
                }
              />
              <DetailRow
                label="Last QA"
                value={
                  item.lastQaAt
                    ? formatDateShort(item.lastQaAt)
                    : "Not recorded"
                }
              />
              <DetailRow
                label="Next QA due"
                value={
                  item.nextQaDue
                    ? formatDateShort(item.nextQaDue)
                    : "Not scheduled"
                }
              />
              <DetailRow
                label="Studies recorded"
                value={String(item.studies)}
              />
              <DetailRow
                label="Latest event"
                value={
                  item.events[0]
                    ? `${humanize(item.events[0].type)} · ${humanize(item.events[0].status)}`
                    : "None"
                }
              />
            </DetailGrid>
            {can("radiology.manage") ? (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(item.id)}
                >
                  <Wrench className="size-4" />
                  Record quality event
                </Button>
              </div>
            ) : null}
          </Panel>
        ))}
      </div>
      <EquipmentEventDialog
        equipmentId={selected}
        onClose={() => setSelected(null)}
      />
    </PageShell>
  );
}

function EquipmentEventDialog({
  equipmentId,
  onClose,
}: {
  equipmentId: string | null;
  onClose: () => void;
}) {
  const [type, setType] = React.useState<
    "QA" | "CALIBRATION" | "MAINTENANCE" | "DOWNTIME" | "RETURN_TO_SERVICE"
  >("QA");
  const [status, setStatus] = React.useState<
    "DUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
  >("COMPLETED");
  const [result, setResult] = React.useState("");
  const save = useAction(
    "radiology.equipmentEvent",
    () => ({ equipmentId: equipmentId!, type, status, result }),
    { success: "Equipment event recorded", onSuccess: onClose }
  );
  return (
    <FormDialog
      open={Boolean(equipmentId)}
      onOpenChange={open => !open && onClose()}
      title="Record equipment event"
      submitLabel="Save event"
      isSubmitting={save.isPending}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label className="space-y-1 text-sm">
        Type
        <SelectField
          value={type}
          onChange={event => setType(event.target.value as typeof type)}
        >
          {[
            "QA",
            "CALIBRATION",
            "MAINTENANCE",
            "DOWNTIME",
            "RETURN_TO_SERVICE",
          ].map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
      </label>
      <label className="space-y-1 text-sm">
        Status
        <SelectField
          value={status}
          onChange={event => setStatus(event.target.value as typeof status)}
        >
          {["DUE", "IN_PROGRESS", "COMPLETED", "FAILED"].map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
      </label>
      <label className="space-y-1 text-sm">
        Result / notes
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-surface p-3"
          value={result}
          onChange={event => setResult(event.target.value)}
        />
      </label>
    </FormDialog>
  );
}
