"use client";

import * as React from "react";

import { Edit, Plus, Trash2 } from "@/components/icons";
import { Field, SelectField } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import type { WardBoard } from "@/features/beds/views";
import { useAction } from "@/lib/api/client";
import { formatINR, humanize } from "@/lib/format";

const EMPTY_WARD = {
  code: "",
  name: "",
  floor: "",
  category: "",
  dailyRate: "",
  gender: "",
  maxAge: "",
};

type DeleteTarget =
  | { type: "ward"; id: string; label: string }
  | { type: "room"; id: string; label: string }
  | null;

export function StructureDialog({
  open,
  onOpenChange,
  wards,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wards: WardBoard[];
}) {
  const [section, setSection] = React.useState<"wards" | "rooms">("wards");
  const [wardId, setWardId] = React.useState("");
  const [wardForm, setWardForm] = React.useState(EMPTY_WARD);
  const [roomWardId, setRoomWardId] = React.useState("");
  const [roomId, setRoomId] = React.useState("");
  const [roomNumber, setRoomNumber] = React.useState("");
  const [capacity, setCapacity] = React.useState("1");
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget>(null);

  React.useEffect(() => {
    if (!open) return;
    if (!roomWardId || !wards.some(ward => ward.id === roomWardId))
      setRoomWardId(wards[0]?.id ?? "");
  }, [open, roomWardId, wards]);

  const resetWard = () => {
    setWardId("");
    setWardForm(EMPTY_WARD);
  };
  const resetRoom = () => {
    setRoomId("");
    setRoomNumber("");
    setCapacity("1");
  };

  const createWard = useAction(
    "beds.createWard",
    () => ({
      code: wardForm.code,
      name: wardForm.name,
      floor: Number(wardForm.floor),
      category: wardForm.category,
      dailyRate: Number(wardForm.dailyRate),
      gender: wardForm.gender
        ? (wardForm.gender as "MALE" | "FEMALE" | "OTHER")
        : undefined,
      maxAge: wardForm.maxAge ? Number(wardForm.maxAge) : undefined,
    }),
    { success: "Ward category added", onSuccess: resetWard }
  );
  const editWard = useAction(
    "beds.updateWard",
    () => ({
      wardId,
      code: wardForm.code,
      name: wardForm.name,
      floor: Number(wardForm.floor),
      category: wardForm.category,
      dailyRate: Number(wardForm.dailyRate),
      gender: wardForm.gender
        ? (wardForm.gender as "MALE" | "FEMALE" | "OTHER")
        : undefined,
      maxAge: wardForm.maxAge ? Number(wardForm.maxAge) : undefined,
    }),
    { success: "Ward category updated", onSuccess: resetWard }
  );
  const removeWard = useAction(
    "beds.deleteWard",
    (id: string) => ({ wardId: id }),
    { success: "Ward category removed" }
  );
  const createRoom = useAction(
    "beds.createRoom",
    () => ({
      wardId: roomWardId,
      number: roomNumber,
      capacity: Number(capacity),
    }),
    { success: "Room added", onSuccess: resetRoom }
  );
  const editRoom = useAction(
    "beds.updateRoom",
    () => ({ roomId, number: roomNumber }),
    { success: "Room renamed", onSuccess: resetRoom }
  );
  const removeRoom = useAction(
    "beds.deleteRoom",
    (id: string) => ({ roomId: id }),
    { success: "Room removed" }
  );

  const wardValid =
    wardForm.code.trim().length >= 2 &&
    wardForm.name.trim().length >= 2 &&
    wardForm.category.trim().length >= 2 &&
    /^\d+$/.test(wardForm.floor) &&
    wardForm.dailyRate !== "" &&
    Number(wardForm.dailyRate) >= 0;
  const roomValid =
    Boolean(roomWardId) &&
    roomNumber.trim().length > 0 &&
    (Boolean(roomId) ||
      (/^\d+$/.test(capacity) &&
        Number(capacity) >= 0 &&
        Number(capacity) <= 50));

  const startWardEdit = (ward: WardBoard) => {
    setWardId(ward.id);
    setWardForm({
      code: ward.code,
      name: ward.name,
      floor: String(ward.floor),
      category: ward.category,
      dailyRate: String(ward.dailyRate),
      gender: ward.restriction?.gender ?? "",
      maxAge:
        ward.restriction?.maxAge === undefined
          ? ""
          : String(ward.restriction.maxAge),
    });
  };

  const currentWard = wards.find(ward => ward.id === roomWardId);
  const busy =
    createWard.isPending ||
    editWard.isPending ||
    createRoom.isPending ||
    editRoom.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Manage wards and rooms</DialogTitle>
            <DialogDescription>
              Add, rename or safely remove ward categories and rooms. Historical
              or active beds stay protected.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <CategorySwitcher
              label="Bed setup section"
              value={section}
              onValueChange={setSection}
              items={[
                {
                  value: "wards",
                  label: "Ward categories",
                  count: wards.length,
                },
                {
                  value: "rooms",
                  label: "Rooms",
                  count: wards.reduce(
                    (sum, ward) => sum + ward.rooms.length,
                    0
                  ),
                },
              ]}
            />

            {section === "wards" ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
                <div className="space-y-2">
                  {wards.map(ward => (
                    <div
                      key={ward.id}
                      className="rounded-xl border border-border bg-card p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{ward.name}</p>
                            <Tag tone="neutral">{humanize(ward.category)}</Tag>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ward.code} · Floor {ward.floor} ·{" "}
                            {ward.rooms.length} room
                            {ward.rooms.length === 1 ? "" : "s"} ·{" "}
                            {formatINR(ward.dailyRate)}/day
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Edit ${ward.name}`}
                            onClick={() => startWardEdit(ward)}
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${ward.name}`}
                            onClick={() =>
                              setDeleteTarget({
                                type: "ward",
                                id: ward.id,
                                label: ward.name,
                              })
                            }
                          >
                            <Trash2 className="size-4 text-error-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!wards.length ? (
                    <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      No ward categories yet.
                    </p>
                  ) : null}
                </div>

                <form
                  className="h-fit space-y-3 rounded-xl border border-primary-border bg-primary-surface/50 p-4 shadow-sm"
                  onSubmit={event => {
                    event.preventDefault();
                    if (!wardValid) return;
                    if (wardId) editWard.mutate();
                    else createWard.mutate();
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">
                      {wardId ? "Edit ward category" : "Add ward category"}
                    </h3>
                    {wardId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={resetWard}
                      >
                        Cancel edit
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Ward name" required className="sm:col-span-2">
                      <Input
                        value={wardForm.name}
                        onChange={event =>
                          setWardForm(form => ({
                            ...form,
                            name: event.target.value,
                          }))
                        }
                        placeholder="General Ward - Male"
                      />
                    </Field>
                    <Field label="Short code" required>
                      <Input
                        value={wardForm.code}
                        onChange={event =>
                          setWardForm(form => ({
                            ...form,
                            code: event.target.value,
                          }))
                        }
                        placeholder="GWM"
                      />
                    </Field>
                    <Field
                      label="Category"
                      required
                      hint="Any category name is allowed"
                    >
                      <Input
                        value={wardForm.category}
                        onChange={event =>
                          setWardForm(form => ({
                            ...form,
                            category: event.target.value,
                          }))
                        }
                        placeholder="General"
                      />
                    </Field>
                    <Field label="Floor" required>
                      <Input
                        type="number"
                        min={0}
                        max={200}
                        value={wardForm.floor}
                        onChange={event =>
                          setWardForm(form => ({
                            ...form,
                            floor: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Daily bed rate" required>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={wardForm.dailyRate}
                        onChange={event =>
                          setWardForm(form => ({
                            ...form,
                            dailyRate: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Gender restriction">
                      <SelectField
                        value={wardForm.gender}
                        onChange={event =>
                          setWardForm(form => ({
                            ...form,
                            gender: event.target.value,
                          }))
                        }
                      >
                        <option value="">No restriction</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </SelectField>
                    </Field>
                    <Field label="Maximum age" hint="Leave blank for any age">
                      <Input
                        type="number"
                        min={0}
                        max={150}
                        value={wardForm.maxAge}
                        onChange={event =>
                          setWardForm(form => ({
                            ...form,
                            maxAge: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!wardValid || busy}
                  >
                    {wardId ? (
                      <Edit className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {wardId ? "Save category" : "Add category"}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div>
                  <Field label="Show rooms in" className="mb-3">
                    <SelectField
                      value={roomWardId}
                      onChange={event => {
                        setRoomWardId(event.target.value);
                        resetRoom();
                      }}
                    >
                      {wards.map(ward => (
                        <option key={ward.id} value={ward.id}>
                          {ward.name}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <div className="space-y-2">
                    {currentWard?.rooms.map(room => (
                      <div
                        key={room.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                      >
                        <div>
                          <p className="font-medium">Room {room.number}</p>
                          <p className="text-xs text-muted-foreground">
                            {room.beds.length} bed
                            {room.beds.length === 1 ? "" : "s"} · minimum safe
                            capacity {room.minimumCapacity}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Rename room ${room.number}`}
                            onClick={() => {
                              setRoomId(room.id);
                              setRoomNumber(room.number);
                            }}
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove room ${room.number}`}
                            onClick={() =>
                              setDeleteTarget({
                                type: "room",
                                id: room.id,
                                label: `Room ${room.number}`,
                              })
                            }
                          >
                            <Trash2 className="size-4 text-error-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {currentWard && !currentWard.rooms.length ? (
                      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                        No rooms in this ward yet.
                      </p>
                    ) : null}
                  </div>
                </div>

                <form
                  className="h-fit space-y-3 rounded-xl border border-info-border bg-info-surface/50 p-4 shadow-sm"
                  onSubmit={event => {
                    event.preventDefault();
                    if (!roomValid) return;
                    if (roomId) editRoom.mutate();
                    else createRoom.mutate();
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">
                      {roomId ? "Rename room" : "Add room"}
                    </h3>
                    {roomId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={resetRoom}
                      >
                        Cancel edit
                      </Button>
                    ) : null}
                  </div>
                  <Field label="Room number or name" required>
                    <Input
                      value={roomNumber}
                      onChange={event => setRoomNumber(event.target.value)}
                      placeholder="204 or Isolation A"
                    />
                  </Field>
                  {!roomId ? (
                    <Field
                      label="Starting beds"
                      required
                      hint="Capacity can be changed later"
                    >
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={capacity}
                        onChange={event => setCapacity(event.target.value)}
                      />
                    </Field>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!roomValid || busy || !wards.length}
                  >
                    {roomId ? (
                      <Edit className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {roomId ? "Save room name" : "Add room"}
                  </Button>
                </form>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        onOpenChange={next => !next && setDeleteTarget(null)}
        title={`Remove ${deleteTarget?.label ?? "item"}?`}
        description="This is allowed only when every bed is available and has no stay history. Active and historical beds are always protected."
        confirmText="Remove"
        variant="destructive"
        isLoading={removeWard.isPending || removeRoom.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "ward")
            await removeWard.mutateAsync(deleteTarget.id);
          else await removeRoom.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
