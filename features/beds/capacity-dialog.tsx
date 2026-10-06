"use client";

import * as React from "react";

import { Field } from "@/components/shared/page";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import type { WardBoard } from "@/features/beds/views";
import { useAction } from "@/lib/api/client";

const MAX_ROOM_CAPACITY = 50;

function initialValues(wards: WardBoard[]) {
  return Object.fromEntries(
    wards.flatMap(ward =>
      ward.rooms.map(room => [room.id, String(room.beds.length)])
    )
  );
}

export function CapacityDialog({
  open,
  onOpenChange,
  wards,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wards: WardBoard[];
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      setValues({});
      return;
    }
    setValues(current =>
      Object.keys(current).length ? current : initialValues(wards)
    );
  }, [open, wards]);

  const rooms = wards.flatMap(ward =>
    ward.rooms.map(room => ({ ...room, ward: ward.name }))
  );
  const parsed = rooms.map(room => ({
    ...room,
    capacity: Number(values[room.id]),
    valid:
      /^\d+$/.test(values[room.id] ?? "") &&
      Number(values[room.id]) >= room.minimumCapacity &&
      Number(values[room.id]) <= MAX_ROOM_CAPACITY,
  }));
  const changes = parsed.filter(
    room => room.valid && room.capacity !== room.beds.length
  );
  const valid = parsed.every(room => room.valid);
  const currentTotal = rooms.reduce((sum, room) => sum + room.beds.length, 0);
  const nextTotal = parsed.reduce(
    (sum, room) => sum + (Number.isFinite(room.capacity) ? room.capacity : 0),
    0
  );

  const update = useAction(
    "beds.updateCapacity",
    (roomChanges: typeof changes) => ({
      rooms: roomChanges.map(room => ({
        roomId: room.id,
        capacity: room.capacity,
      })),
    }),
    {
      success: result =>
        `${result.length} room${result.length === 1 ? "" : "s"} updated`,
      errorTitle: "Could not update bed capacity",
      onSuccess: () => onOpenChange(false),
    }
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit bed capacity"
      description="Set the number of beds in each existing room. Reductions can remove only available beds that have never held a patient."
      size="xl"
      submitLabel="Save capacity"
      submitDisabled={!valid || changes.length === 0}
      isSubmitting={update.isPending}
      onSubmit={event => {
        event.preventDefault();
        if (valid && changes.length) update.mutate(changes);
      }}
      footerStart={
        <p className="self-center text-xs tabular-nums text-muted-foreground">
          Total beds: {currentTotal} → {valid ? nextTotal : "—"}
        </p>
      }
    >
      <div className="space-y-4">
        {wards.map(ward => (
          <section key={ward.id} aria-labelledby={`capacity-${ward.id}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3
                id={`capacity-${ward.id}`}
                className="text-[0.8125rem] font-semibold"
              >
                {ward.name}
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {ward.total} beds now
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ward.rooms.map(room => {
                const value = values[room.id] ?? "";
                const belowMinimum =
                  /^\d+$/.test(value) && Number(value) < room.minimumCapacity;
                return (
                  <div
                    key={room.id}
                    className="rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {ward.code === "HDU" ? "Unit" : `Room ${room.number}`}
                      </span>
                      {room.minimumCapacity > 0 ? (
                        <Tag tone="neutral">
                          {room.minimumCapacity} protected
                        </Tag>
                      ) : null}
                    </div>
                    <Field
                      label="Beds"
                      error={
                        belowMinimum
                          ? `Minimum ${room.minimumCapacity}; other beds are active or have stay history`
                          : undefined
                      }
                      hint={
                        room.minimumCapacity === 0
                          ? "May be reduced to zero"
                          : undefined
                      }
                    >
                      <Input
                        type="number"
                        min={room.minimumCapacity}
                        max={MAX_ROOM_CAPACITY}
                        step={1}
                        value={value}
                        aria-label={`Capacity for room ${room.number}`}
                        onChange={event =>
                          setValues(current => ({
                            ...current,
                            [room.id]: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </FormDialog>
  );
}
