import type {
  Database,
  ID,
  LabOrder,
  LabParameter,
  LabPriority,
  ResultFlag,
} from "../sim/schema";
import { isoDate } from "../sim/time";
import {
  DomainError,
  assert,
  log,
  must,
  newId,
  nextCode,
  nowIso,
  touch,
  type Tx,
} from "../sim/tx";
import { postCharge, withdrawCharges } from "./billing";
import { activateAdmission, assertEncounterAcceptsOrders } from "./encounters";

export function flagFor(parameter: LabParameter, raw: string): ResultFlag {
  const value = raw.trim();
  if (parameter.options?.length || parameter.refText) {
    if (!parameter.refText) return "NORMAL";
    return value.toLowerCase() === parameter.refText.toLowerCase()
      ? "NORMAL"
      : "ABNORMAL";
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return "ABNORMAL";
  if (parameter.criticalLow !== undefined && n < parameter.criticalLow)
    return "CRITICAL_LOW";
  if (parameter.criticalHigh !== undefined && n > parameter.criticalHigh)
    return "CRITICAL_HIGH";
  if (parameter.refLow !== undefined && n < parameter.refLow) return "LOW";
  if (parameter.refHigh !== undefined && n > parameter.refHigh) return "HIGH";
  return "NORMAL";
}

export function labOrderTests(db: Database, orderId: ID) {
  return db.labOrderItems
    .filter(item => item.labOrderId === orderId)
    .map(item => ({ item, test: must(db.labTests, item.testId, "Lab test") }));
}

export function createLabOrder(
  tx: Tx,
  input: {
    encounterId: ID;
    testIds: ID[];
    priority: LabPriority;
    clinicalNotes?: string;
  }
): LabOrder {
  const encounter = must(tx.db.encounters, input.encounterId, "Encounter");
  assertEncounterAcceptsOrders(tx, encounter);
  const testIds = [...new Set(input.testIds)];
  assert(testIds.length > 0, "Select at least one test.");

  const order: LabOrder = {
    id: newId(tx, "lab"),
    code: nextCode(tx, "LAB"),
    patientId: encounter.patientId,
    encounterId: encounter.id,
    admissionId: encounter.admissionId,
    orderedById: tx.actorId,
    orderedAt: nowIso(tx),
    priority: input.priority,
    clinicalNotes: input.clinicalNotes?.trim() ?? "",
    status: "ORDERED",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.labOrders.push(order);

  for (const testId of testIds) {
    const test = must(tx.db.labTests, testId, "Lab test");
    const item = {
      id: newId(tx, "lbi"),
      labOrderId: order.id,
      testId,
      price: test.price,
    };
    tx.db.labOrderItems.push(item);
    postCharge(
      tx,
      {
        patientId: order.patientId,
        encounterId: order.encounterId,
        admissionId: order.admissionId,
      },
      {
        category: "LAB",
        description: `${test.name} (${order.code})`,
        quantity: 1,
        unitPrice: test.price,
        sourceType: "LAB_ORDER_ITEM",
        sourceId: item.id,
      }
    );
  }

  if (order.admissionId) activateAdmission(tx, order.admissionId);
  log(tx, {
    entityType: "lab",
    entityId: order.id,
    patientId: order.patientId,
    action: "ordered",
    summary: `Lab order ${order.code} placed (${testIds.length} test${testIds.length === 1 ? "" : "s"}, ${order.priority.toLowerCase()})`,
  });
  return order;
}

function transition(
  tx: Tx,
  order: LabOrder,
  from: LabOrder["status"][],
  to: LabOrder["status"]
) {
  if (!from.includes(order.status)) {
    throw new DomainError(
      `Lab order ${order.code} is ${order.status.replace(/_/g, " ").toLowerCase()}; it cannot move to ${to.replace(/_/g, " ").toLowerCase()}.`
    );
  }
  order.status = to;
  touch(tx, order);
}

export function requestSample(tx: Tx, orderId: ID) {
  const order = must(tx.db.labOrders, orderId, "Lab order");
  transition(tx, order, ["ORDERED"], "SAMPLE_PENDING");
  order.sampleRequestedAt = nowIso(tx);
  log(tx, {
    entityType: "lab",
    entityId: order.id,
    patientId: order.patientId,
    action: "sample_pending",
    summary: `Sample requested for ${order.code}`,
  });
  return order;
}

export function collectSample(tx: Tx, orderId: ID) {
  const order = must(tx.db.labOrders, orderId, "Lab order");
  transition(tx, order, ["ORDERED", "SAMPLE_PENDING"], "COLLECTED");
  order.sampleRequestedAt ??= nowIso(tx);
  const seq = (tx.db.meta.counters["sample"] ?? 0) + 1;
  tx.db.meta.counters["sample"] = seq;
  order.sampleId = `S${isoDate(tx.now).replace(/-/g, "").slice(2)}-${String(seq).padStart(4, "0")}`;
  order.sampleCollectedAt = nowIso(tx);
  order.collectedById = tx.actorId;
  log(tx, {
    entityType: "lab",
    entityId: order.id,
    patientId: order.patientId,
    action: "collected",
    summary: `Sample ${order.sampleId} collected for ${order.code}`,
  });
  return order;
}

export function startProcessing(tx: Tx, orderId: ID) {
  const order = must(tx.db.labOrders, orderId, "Lab order");
  transition(tx, order, ["COLLECTED"], "PROCESSING");
  order.processingStartedAt = nowIso(tx);
  order.technicianId = tx.actorId;
  log(tx, {
    entityType: "lab",
    entityId: order.id,
    patientId: order.patientId,
    action: "processing",
    summary: `${order.code} in processing`,
  });
  return order;
}

/** values: labOrderItemId → parameterId → raw value */
export function enterResults(
  tx: Tx,
  orderId: ID,
  values: Record<ID, Record<ID, string>>
) {
  const order = must(tx.db.labOrders, orderId, "Lab order");
  assert(
    order.status === "PROCESSING" || order.status === "RESULT_READY",
    "Results can be entered once the sample is in processing."
  );

  const tests = labOrderTests(tx.db, order.id);
  const itemIds = new Set(tests.map(t => t.item.id));
  tx.db.labResults = tx.db.labResults.filter(
    r => !itemIds.has(r.labOrderItemId)
  );

  for (const { item, test } of tests) {
    for (const parameter of test.parameters) {
      const value = values[item.id]?.[parameter.id]?.trim();
      if (!value)
        throw new DomainError(
          `Enter a value for ${test.name} → ${parameter.name}.`
        );
      if (
        !parameter.options &&
        !parameter.refText &&
        !Number.isFinite(Number(value))
      ) {
        throw new DomainError(`${parameter.name} must be a number.`);
      }
      if (
        parameter.options?.length &&
        !parameter.options.some(o => o.toLowerCase() === value.toLowerCase())
      ) {
        throw new DomainError(
          `${parameter.name} must be one of: ${parameter.options.join(", ")}.`
        );
      }
      tx.db.labResults.push({
        id: newId(tx, "lbr"),
        labOrderItemId: item.id,
        parameterId: parameter.id,
        value,
        flag: flagFor(parameter, value),
        enteredAt: nowIso(tx),
        enteredById: tx.actorId,
      });
    }
  }

  const first = order.status === "PROCESSING";
  order.status = "RESULT_READY";
  order.resultEnteredAt = nowIso(tx);
  touch(tx, order);
  log(tx, {
    entityType: "lab",
    entityId: order.id,
    patientId: order.patientId,
    action: "result",
    summary: first
      ? `Results entered for ${order.code}`
      : `Results corrected for ${order.code}`,
  });
  return order;
}

export function verifyResults(tx: Tx, orderId: ID) {
  const order = must(tx.db.labOrders, orderId, "Lab order");
  transition(tx, order, ["RESULT_READY"], "VERIFIED");
  order.verifiedAt = nowIso(tx);
  order.verifiedById = tx.actorId;
  const itemIds = new Set(labOrderTests(tx.db, order.id).map(t => t.item.id));
  const critical = tx.db.labResults.some(
    r =>
      itemIds.has(r.labOrderItemId) &&
      (r.flag === "CRITICAL_HIGH" || r.flag === "CRITICAL_LOW")
  );
  log(tx, {
    entityType: "lab",
    entityId: order.id,
    patientId: order.patientId,
    action: "verified",
    summary: `${order.code} verified${critical ? " — critical value reported" : ""}; report released to the patient record`,
  });
  return order;
}

export function cancelLabOrder(tx: Tx, orderId: ID, reason: string) {
  const order = must(tx.db.labOrders, orderId, "Lab order");
  assert(
    order.status === "ORDERED" || order.status === "SAMPLE_PENDING",
    "Only orders whose sample has not been collected can be cancelled."
  );
  const itemIds = tx.db.labOrderItems
    .filter(i => i.labOrderId === order.id)
    .map(i => i.id);
  withdrawCharges(tx, "LAB_ORDER_ITEM", itemIds);
  order.status = "CANCELLED";
  order.cancelledAt = nowIso(tx);
  order.cancelReason = reason.trim() || "Cancelled";
  touch(tx, order);
  log(tx, {
    entityType: "lab",
    entityId: order.id,
    patientId: order.patientId,
    action: "cancelled",
    summary: `${order.code} cancelled: ${order.cancelReason}`,
  });
  return order;
}

/** Hours from order to verification (or to now while still open). */
export function turnaroundHours(order: LabOrder, now: Date) {
  const end = order.verifiedAt ? new Date(order.verifiedAt) : now;
  return (end.getTime() - new Date(order.orderedAt).getTime()) / 3_600_000;
}

export function expectedTatHours(db: Database, order: LabOrder) {
  const tests = labOrderTests(db, order.id);
  const base = Math.max(...tests.map(t => t.test.turnaroundHours), 1);
  return order.priority === "STAT"
    ? Math.min(base, 2)
    : order.priority === "URGENT"
      ? Math.min(base, 6)
      : base;
}

export function isLabOverdue(db: Database, order: LabOrder, now: Date) {
  if (order.status === "VERIFIED" || order.status === "CANCELLED") return false;
  return turnaroundHours(order, now) > expectedTatHours(db, order);
}
