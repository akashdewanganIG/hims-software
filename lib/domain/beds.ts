/** Administrative bed-capacity rules. */
import { ADMINISTRATOR_ROLE } from "../rbac";
import type { Bed, Gender, ID, Room, Ward } from "../sim/schema";
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

export interface WardInput {
  code: string;
  name: string;
  floor: number;
  category: string;
  dailyRate: number;
  restriction?: { gender?: Gender; maxAge?: number };
}

function normaliseLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normaliseCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

function validateWardInput(tx: Tx, input: WardInput, exceptId?: ID) {
  const code = normaliseCode(input.code);
  const name = normaliseLabel(input.name);
  const category = normaliseLabel(input.category);
  assert(
    code.length >= 2 && code.length <= 12,
    "Ward code must be 2–12 characters."
  );
  assert(
    name.length >= 2 && name.length <= 80,
    "Ward name must be 2–80 characters."
  );
  assert(
    category.length >= 2 && category.length <= 50,
    "Category must be 2–50 characters."
  );
  assert(
    Number.isInteger(input.floor) && input.floor >= 0 && input.floor <= 200,
    "Floor must be a whole number between 0 and 200."
  );
  assert(
    input.dailyRate >= 0 && input.dailyRate <= 1_000_000,
    "Daily rate must be between ₹0 and ₹10,00,000."
  );
  assert(
    !tx.db.wards.some(
      ward =>
        ward.id !== exceptId && ward.code.toLowerCase() === code.toLowerCase()
    ),
    `Ward code ${code} is already in use.`
  );
  assert(
    !tx.db.wards.some(
      ward =>
        ward.id !== exceptId && ward.name.toLowerCase() === name.toLowerCase()
    ),
    `Ward name ${name} is already in use.`
  );
  return { code, name, category };
}

export function createWard(tx: Tx, input: WardInput) {
  administratorOnly(tx);
  const labels = validateWardInput(tx, input);
  const createdAt = nowIso(tx);
  const ward: Ward = {
    id: newId(tx, "ward"),
    ...labels,
    floor: input.floor,
    dailyRate: input.dailyRate,
    restriction: input.restriction,
    createdAt,
    updatedAt: createdAt,
  };
  tx.db.wards.push(ward);
  log(tx, {
    entityType: "ward",
    entityId: ward.id,
    action: "created",
    summary: `${ward.name} (${ward.category}) added on floor ${ward.floor}`,
  });
  return ward;
}

export function updateWard(tx: Tx, wardId: ID, input: WardInput) {
  administratorOnly(tx);
  const ward = must(tx.db.wards, wardId, "Ward");
  const labels = validateWardInput(tx, input, ward.id);
  Object.assign(ward, labels, {
    floor: input.floor,
    dailyRate: input.dailyRate,
    restriction: input.restriction,
    updatedAt: nowIso(tx),
  });
  log(tx, {
    entityType: "ward",
    entityId: ward.id,
    action: "updated",
    summary: `${ward.name} details updated`,
  });
  return ward;
}

function assertBedsRemovable(tx: Tx, beds: Bed[], label: string) {
  const removable = removableBeds(tx, beds);
  assert(
    removable.length === beds.length,
    `${label} cannot be removed because one or more beds are active or have stay history.`
  );
}

export function deleteWard(tx: Tx, wardId: ID) {
  administratorOnly(tx);
  const ward = must(tx.db.wards, wardId, "Ward");
  const roomIds = new Set(
    tx.db.rooms.filter(room => room.wardId === ward.id).map(room => room.id)
  );
  const beds = tx.db.beds.filter(bed => roomIds.has(bed.roomId));
  assertBedsRemovable(tx, beds, ward.name);
  const bedIds = new Set(beds.map(bed => bed.id));
  tx.db.beds = tx.db.beds.filter(bed => !bedIds.has(bed.id));
  tx.db.rooms = tx.db.rooms.filter(room => room.wardId !== ward.id);
  tx.db.wards = tx.db.wards.filter(row => row.id !== ward.id);
  log(tx, {
    entityType: "ward",
    entityId: ward.id,
    action: "deleted",
    summary: `${ward.name} and ${beds.length} unused bed${beds.length === 1 ? "" : "s"} removed`,
  });
  return { id: ward.id, name: ward.name };
}

function validateRoomNumber(tx: Tx, wardId: ID, number: string, exceptId?: ID) {
  const value = normaliseLabel(number);
  assert(
    value.length >= 1 && value.length <= 20,
    "Room number must be 1–20 characters."
  );
  assert(
    !tx.db.rooms.some(
      room =>
        room.id !== exceptId &&
        room.wardId === wardId &&
        room.number.toLowerCase() === value.toLowerCase()
    ),
    `Room ${value} already exists in this ward.`
  );
  return value;
}

export function createRoom(
  tx: Tx,
  wardId: ID,
  number: string,
  capacity: number
) {
  administratorOnly(tx);
  const ward = must(tx.db.wards, wardId, "Ward");
  assert(
    Number.isInteger(capacity) &&
      capacity >= 0 &&
      capacity <= MAX_ROOM_CAPACITY,
    `Room capacity must be between 0 and ${MAX_ROOM_CAPACITY}.`
  );
  const room: Room = {
    id: newId(tx, "room"),
    wardId,
    number: validateRoomNumber(tx, wardId, number),
  };
  tx.db.rooms.push(room);
  const createdAt = nowIso(tx);
  for (let index = 0; index < capacity; index += 1) {
    const roomBeds = tx.db.beds.filter(bed => bed.roomId === room.id);
    tx.db.beds.push({
      id: newId(tx, "bed"),
      roomId: room.id,
      code: nextBedCode(tx, ward, room, roomBeds),
      status: "AVAILABLE",
      statusChangedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }
  log(tx, {
    entityType: "ward",
    entityId: ward.id,
    action: "room_created",
    summary: `${ward.name} · room ${room.number} added with ${capacity} bed${capacity === 1 ? "" : "s"}`,
  });
  return room;
}

export function updateRoom(tx: Tx, roomId: ID, number: string) {
  administratorOnly(tx);
  const room = must(tx.db.rooms, roomId, "Room");
  const ward = must(tx.db.wards, room.wardId, "Ward");
  room.number = validateRoomNumber(tx, room.wardId, number, room.id);
  log(tx, {
    entityType: "ward",
    entityId: ward.id,
    action: "room_updated",
    summary: `${ward.name} · room renamed to ${room.number}`,
  });
  return room;
}

export function deleteRoom(tx: Tx, roomId: ID) {
  administratorOnly(tx);
  const room = must(tx.db.rooms, roomId, "Room");
  const ward = must(tx.db.wards, room.wardId, "Ward");
  const beds = tx.db.beds.filter(bed => bed.roomId === room.id);
  assertBedsRemovable(tx, beds, `Room ${room.number}`);
  const bedIds = new Set(beds.map(bed => bed.id));
  tx.db.beds = tx.db.beds.filter(bed => !bedIds.has(bed.id));
  tx.db.rooms = tx.db.rooms.filter(row => row.id !== room.id);
  log(tx, {
    entityType: "ward",
    entityId: ward.id,
    action: "room_deleted",
    summary: `${ward.name} · room ${room.number} removed`,
  });
  return { id: room.id, number: room.number };
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
