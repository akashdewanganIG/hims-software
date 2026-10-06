/** Administrative bed-capacity rules. */
import { ADMINISTRATOR_ROLE } from "../rbac";
import type { Bed, ID, Room, Ward } from "../sim/schema";
import {
  assert,
  DomainError,
  log,
  must,
  newId,
  nowIso,
  type Tx,
} from "../sim/tx";

export const MAX_ROOM_CAPACITY = 50;

export interface RoomCapacityUpdate {
  roomId: ID;
  capacity: number;
}

function columnLabel(position: number) {
  let value = position;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

/** Preserve the seeded naming convention while filling the first free code. */
function nextBedCode(tx: Tx, ward: Ward, room: Room, roomBeds: Bed[]) {
  const used = new Set(tx.db.beds.map(bed => bed.code));
  const singleBedStyle =
    ward.category === "PRIVATE" ||
    roomBeds.some(bed => bed.code === room.number);

  for (let position = 1; position <= MAX_ROOM_CAPACITY + 1; position += 1) {
    const code =
      ward.code === "HDU"
        ? `HDU-${position}`
        : singleBedStyle && position === 1
          ? room.number
          : `${room.number}-${columnLabel(position)}`;
    if (!used.has(code)) return code;
  }
  throw new DomainError(
    `Room ${room.number} has no available bed codes. Reduce its capacity before adding more beds.`
  );
}

function removableBeds(tx: Tx, roomBeds: Bed[]) {
  const assigned = new Set(tx.db.bedAssignments.map(row => row.bedId));
  return roomBeds
    .filter(
      bed =>
        bed.status === "AVAILABLE" && !bed.admissionId && !assigned.has(bed.id)
    )
    .reverse();
}

function administratorOnly(tx: Tx) {
  const login = tx.db.users.find(user => user.staffId === tx.actorId);
  assert(
    login?.roleId === ADMINISTRATOR_ROLE,
    "Only an Administrator can change bed capacity."
  );
}

/**
 * Changes the number of beds in existing rooms. Beds with an active state or
 * any assignment history are retained, so capacity edits cannot damage care
 * workflows or historical stays.
 */
export function updateRoomCapacities(tx: Tx, updates: RoomCapacityUpdate[]) {
  administratorOnly(tx);
  assert(updates.length > 0, "Choose at least one room to update.");
  assert(
    new Set(updates.map(update => update.roomId)).size === updates.length,
    "Each room can be updated only once."
  );

  const changed: Array<{
    roomId: ID;
    room: string;
    ward: string;
    before: number;
    after: number;
  }> = [];

  for (const update of updates) {
    const room = must(tx.db.rooms, update.roomId, "Room");
    const ward = must(tx.db.wards, room.wardId, "Ward");
    const roomBeds = tx.db.beds.filter(bed => bed.roomId === room.id);
    const before = roomBeds.length;
    if (before === update.capacity) continue;

    assert(
      update.capacity >= 0 && update.capacity <= MAX_ROOM_CAPACITY,
      `Room ${room.number} capacity must be between 0 and ${MAX_ROOM_CAPACITY}.`
    );

    let auditBedId: ID;
    if (update.capacity > before) {
      const createdAt = nowIso(tx);
      const additions = update.capacity - before;
      const added: Bed[] = [];
      for (let index = 0; index < additions; index += 1) {
        const bed: Bed = {
          id: newId(tx, "bed"),
          roomId: room.id,
          code: nextBedCode(tx, ward, room, [...roomBeds, ...added]),
          status: "AVAILABLE",
          statusChangedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        };
        tx.db.beds.push(bed);
        added.push(bed);
      }
      auditBedId = added[0]!.id;
    } else {
      const removeCount = before - update.capacity;
      const removable = removableBeds(tx, roomBeds);
      const minimum = before - removable.length;
      assert(
        removable.length >= removeCount,
        `Room ${room.number} cannot be reduced below ${minimum} beds. Only available beds with no stay history can be removed.`
      );
      const removed = removable.slice(0, removeCount);
      auditBedId = removed[0]!.id;
      const removedIds = new Set(removed.map(bed => bed.id));
      tx.db.beds = tx.db.beds.filter(bed => !removedIds.has(bed.id));
    }

    changed.push({
      roomId: room.id,
      room: room.number,
      ward: ward.name,
      before,
      after: update.capacity,
    });
    log(tx, {
      entityType: "bed",
      entityId: auditBedId,
      action: "capacity_updated",
      summary: `${ward.name} · room ${room.number}: capacity ${before} → ${update.capacity}`,
    });
  }

  assert(changed.length > 0, "Nothing to change.");
  return changed;
}
