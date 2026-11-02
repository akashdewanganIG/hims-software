import { sendAlert } from "./alerts";
import { postCharge, withdrawCharges } from "./billing";
import type {
  ID,
  RadiologyCriticality,
  RadiologyPriority,
  RadiologyReportStatus,
} from "../sim/schema";
import {
  assert,
  log,
  must,
  newId,
  nextCode,
  nowIso,
  requireText,
  touch,
  type Tx,
} from "../sim/tx";
import { addMinutes, isoDate } from "../sim/time";

const NON_IONISING = new Set(["MRI", "ULTRASOUND"]);

export function createRadiologyOrders(
  tx: Tx,
  input: {
    patientId: ID;
    encounterId?: ID;
    admissionId?: ID;
    procedureIds: ID[];
    priority: RadiologyPriority;
    clinicalIndication: string;
    provisionalDiagnosis: string;
    externalReferrer?: string;
  }
) {
  const patient = must(tx.db.patients, input.patientId, "Patient");
  if (input.encounterId) {
    const encounter = must(tx.db.encounters, input.encounterId, "Encounter");
    assert(
      encounter.patientId === patient.id,
      "The encounter belongs to another patient."
    );
  }
  if (input.admissionId) {
    const admission = must(tx.db.admissions, input.admissionId, "Admission");
    assert(
      admission.patientId === patient.id,
      "The admission belongs to another patient."
    );
  }
  const procedureIds = [...new Set(input.procedureIds)];
  assert(procedureIds.length > 0, "Select at least one imaging procedure.");
  const batchId = procedureIds.length > 1 ? newId(tx, "rgb") : undefined;
  const source: "IPD" | "OPD" | "EXTERNAL" = input.admissionId
    ? "IPD"
    : input.encounterId
      ? "OPD"
      : "EXTERNAL";
  if (source === "EXTERNAL")
    requireText(input.externalReferrer, "External referrer");
  return procedureIds.map(procedureId => {
    const procedure = must(
      tx.db.radiologyProcedures,
      procedureId,
      "Imaging procedure"
    );
    assert(
      procedure.active,
      `${procedure.name} is not available for ordering.`
    );
    const at = nowIso(tx);
    const order = {
      id: newId(tx, "rdo"),
      accessionNumber: nextCode(tx, "RAD"),
      batchId,
      patientId: patient.id,
      encounterId: input.encounterId,
      admissionId: input.admissionId,
      source,
      externalReferrer: input.externalReferrer?.trim() || undefined,
      procedureId,
      orderedById: tx.actorId,
      orderedAt: at,
      priority: input.priority,
      clinicalIndication: requireText(
        input.clinicalIndication,
        "Clinical indication"
      ),
      provisionalDiagnosis: input.provisionalDiagnosis.trim(),
      status: "ORDERED" as const,
      createdAt: at,
      updatedAt: at,
    };
    tx.db.radiologyOrders.push(order);
    postCharge(
      tx,
      {
        patientId: patient.id,
        encounterId: input.encounterId,
        admissionId: input.admissionId,
      },
      {
        category: "RADIOLOGY",
        description: `${procedure.name} (${order.accessionNumber})`,
        quantity: 1,
        unitPrice: procedure.price,
        sourceType: "RADIOLOGY_ORDER",
        sourceId: order.id,
      }
    );
    log(tx, {
      entityType: "radiology",
      entityId: order.id,
      patientId: patient.id,
      action: "ordered",
      summary: `${order.accessionNumber} · ${procedure.name} ordered`,
    });
    return order;
  });
}

function procedureFor(tx: Tx, orderId: ID) {
  const order = must(tx.db.radiologyOrders, orderId, "Radiology order");
  return {
    order,
    procedure: must(
      tx.db.radiologyProcedures,
      order.procedureId,
      "Imaging procedure"
    ),
  };
}

export function scheduleRadiologyOrder(
  tx: Tx,
  orderId: ID,
  equipmentId: ID,
  scheduledAt: string
) {
  const { order, procedure } = procedureFor(tx, orderId);
  assert(
    ["ORDERED", "SCHEDULED"].includes(order.status),
    "Only an awaiting order can be scheduled."
  );
  const equipment = must(
    tx.db.radiologyEquipment,
    equipmentId,
    "Imaging equipment"
  );
  assert(equipment.status === "ACTIVE", `${equipment.name} is not available.`);
  assert(
    equipment.modality === procedure.modality,
    "The equipment does not match the procedure modality."
  );
  const start = new Date(scheduledAt);
  assert(!Number.isNaN(start.getTime()), "Choose a valid schedule time.");
  const end = addMinutes(start, procedure.durationMinutes);
  for (const other of tx.db.radiologyOrders) {
    if (
      other.id === order.id ||
      other.equipmentId !== equipment.id ||
      !other.scheduledAt ||
      other.status === "CANCELLED"
    )
      continue;
    const otherProcedure = must(
      tx.db.radiologyProcedures,
      other.procedureId,
      "Imaging procedure"
    );
    const otherStart = new Date(other.scheduledAt);
    const otherEnd = addMinutes(otherStart, otherProcedure.durationMinutes);
    assert(
      end <= otherStart || start >= otherEnd,
      `${equipment.name} is already booked during this time.`
    );
  }
  order.equipmentId = equipment.id;
  order.scheduledAt = start.toISOString();
  order.status = "SCHEDULED";
  touch(tx, order);
  return order;
}

export function checkInRadiologyOrder(tx: Tx, orderId: ID) {
  const order = must(tx.db.radiologyOrders, orderId, "Radiology order");
  assert(
    ["ORDERED", "SCHEDULED"].includes(order.status),
    "This order cannot be checked in now."
  );
  order.status = "CHECKED_IN";
  order.checkedInAt = nowIso(tx);
  touch(tx, order);
  return order;
}

export function saveRadiologySafety(
  tx: Tx,
  orderId: ID,
  input: {
    identityVerified: boolean;
    preparationConfirmed: boolean;
    consentConfirmed: boolean;
    allergiesReviewed: boolean;
    renalFunctionReviewed: boolean;
    pregnancyStatus: "NOT_APPLICABLE" | "NOT_PREGNANT" | "PREGNANT" | "UNKNOWN";
    mriImplantScreeningComplete: boolean;
    pcPndtFormComplete: boolean;
    pcPndtIndication?: string;
    lmp?: string;
    contrastAgent?: string;
    contrastDose?: string;
    contrastLot?: string;
    notes?: string;
  }
) {
  const { order, procedure } = procedureFor(tx, orderId);
  assert(
    order.status === "CHECKED_IN",
    "Check the patient in before completing safety checks."
  );
  assert(
    input.identityVerified &&
      input.preparationConfirmed &&
      input.allergiesReviewed,
    "Complete identity, preparation and allergy checks."
  );
  if (procedure.requiresConsent)
    assert(input.consentConfirmed, "Document patient consent.");
  if (procedure.requiresContrast) {
    assert(
      input.renalFunctionReviewed,
      "Review renal function before contrast."
    );
    requireText(input.contrastAgent, "Contrast agent");
    requireText(input.contrastDose, "Contrast dose");
  }
  if (procedure.requiresPregnancyScreening)
    assert(
      input.pregnancyStatus !== "UNKNOWN",
      "Complete pregnancy screening."
    );
  if (procedure.modality === "MRI")
    assert(
      input.mriImplantScreeningComplete,
      "Complete the MRI implant screening checklist."
    );
  if (procedure.requiresPcPndt) {
    assert(
      input.pcPndtFormComplete,
      "Complete PCPNDT Form F before the study."
    );
    requireText(input.pcPndtIndication, "PCPNDT indication");
  }
  const at = nowIso(tx);
  const previous = tx.db.radiologySafetyAssessments.find(
    row => row.orderId === order.id
  );
  const row = previous ?? {
    id: newId(tx, "rds"),
    orderId: order.id,
    createdAt: at,
    updatedAt: at,
    completedById: tx.actorId,
    completedAt: at,
    notes: "",
    pregnancyStatus: "NOT_APPLICABLE" as const,
    identityVerified: false,
    preparationConfirmed: false,
    consentConfirmed: false,
    allergiesReviewed: false,
    renalFunctionReviewed: false,
    mriImplantScreeningComplete: false,
    pcPndtFormComplete: false,
  };
  Object.assign(row, input, {
    notes: input.notes?.trim() ?? "",
    completedById: tx.actorId,
    completedAt: at,
    updatedAt: at,
  });
  if (!previous) tx.db.radiologySafetyAssessments.push(row);
  order.status = "READY";
  order.readyAt = at;
  touch(tx, order);
  return row;
}

export function startRadiologyStudy(tx: Tx, orderId: ID) {
  const { order, procedure } = procedureFor(tx, orderId);
  assert(
    order.status === "READY",
    "Complete the safety checklist before acquisition."
  );
  const equipment = must(
    tx.db.radiologyEquipment,
    order.equipmentId,
    "Scheduled equipment"
  );
  assert(equipment.status === "ACTIVE", `${equipment.name} is not available.`);
  if (!NON_IONISING.has(procedure.modality)) {
    assert(
      Boolean(equipment.aerbLicenceNumber),
      "AERB licence details are missing for this equipment."
    );
    assert(
      Boolean(equipment.aerbLicenceValidUntil) &&
        equipment.aerbLicenceValidUntil! >= isoDate(tx.now),
      "The equipment AERB licence has expired."
    );
  }
  const attempt =
    tx.db.radiologyStudies.filter(row => row.orderId === order.id).length + 1;
  const at = nowIso(tx);
  const study = {
    id: newId(tx, "rdi"),
    orderId: order.id,
    attempt,
    studyInstanceUid: `2.25.${Math.abs(Number.parseInt(newId(tx, "uid").replace(/\D/g, "") || "1", 10))}${tx.now.getTime()}`,
    equipmentId: equipment.id,
    performedById: tx.actorId,
    startedAt: at,
    accepted: false,
    seriesCount: 0,
    imageCount: 0,
    doseMeasurements: [],
    contrastAdministered: false,
    pacsStatus: "PENDING" as const,
    createdAt: at,
    updatedAt: at,
  };
  tx.db.radiologyStudies.push(study);
  order.status = "IN_PROGRESS";
  touch(tx, order);
  return study;
}

export function completeRadiologyStudy(
  tx: Tx,
  studyId: ID,
  input: {
    accepted: boolean;
    rejectionReason?: string;
    seriesCount: number;
    imageCount: number;
    doseMeasurements?: Array<{ label: string; value: number; unit: string }>;
    contrastAdministered?: boolean;
    contrastReaction?: string;
  }
) {
  const study = must(tx.db.radiologyStudies, studyId, "Imaging study");
  const { order, procedure } = procedureFor(tx, study.orderId);
  assert(order.status === "IN_PROGRESS", "This study is not in progress.");
  if (!input.accepted) requireText(input.rejectionReason, "Rejection reason");
  if (procedure.recordsRadiationDose && input.accepted)
    assert(
      (input.doseMeasurements?.length ?? 0) > 0,
      "Record the radiation dose before completing the study."
    );
  Object.assign(study, input, {
    rejectionReason: input.rejectionReason?.trim() || undefined,
    doseMeasurements: input.doseMeasurements ?? [],
    contrastAdministered: Boolean(input.contrastAdministered),
    contrastReaction: input.contrastReaction?.trim() || undefined,
    completedAt: nowIso(tx),
    pacsStatus: input.accepted ? "AVAILABLE" : "FAILED",
    updatedAt: nowIso(tx),
  });
  order.status = input.accepted ? "ACQUIRED" : "READY";
  touch(tx, order);
  return study;
}

export function saveRadiologyReport(
  tx: Tx,
  orderId: ID,
  input: {
    findings: string;
    impression: string;
    recommendations?: string;
    criticality: RadiologyCriticality;
  }
) {
  const order = must(tx.db.radiologyOrders, orderId, "Radiology order");
  assert(
    ["ACQUIRED", "REPORT_DRAFT", "PRELIMINARY"].includes(order.status),
    "Acquire the study before reporting it."
  );
  const study = tx.db.radiologyStudies.find(
    row => row.orderId === order.id && row.accepted
  );
  assert(study, "No accepted imaging study is available.");
  const existing = tx.db.radiologyReports.find(
    row => row.orderId === order.id && row.status === "DRAFT"
  );
  const report = existing ?? {
    id: newId(tx, "rdr"),
    orderId: order.id,
    studyId: study.id,
    version:
      Math.max(
        0,
        ...tx.db.radiologyReports
          .filter(row => row.orderId === order.id)
          .map(row => row.version)
      ) + 1,
    status: "DRAFT" as RadiologyReportStatus,
    findings: "",
    impression: "",
    recommendations: "",
    criticality: "ROUTINE" as RadiologyCriticality,
    radiologistId: tx.actorId,
    createdAt: nowIso(tx),
  };
  Object.assign(report, {
    findings: requireText(input.findings, "Findings"),
    impression: requireText(input.impression, "Impression"),
    recommendations: input.recommendations?.trim() ?? "",
    criticality: input.criticality,
    radiologistId: tx.actorId,
  });
  if (!existing) tx.db.radiologyReports.push(report);
  order.status = "REPORT_DRAFT";
  touch(tx, order);
  return report;
}

export function recordRadiologyCommunication(
  tx: Tx,
  reportId: ID,
  input: {
    recipientId: ID;
    method: "PHONE" | "IN_PERSON" | "SECURE_MESSAGE";
    outcome: string;
    notes?: string;
  }
) {
  const report = must(tx.db.radiologyReports, reportId, "Radiology report");
  assert(
    report.criticality === "CRITICAL",
    "Non-routine communication is required only for critical findings."
  );
  must(tx.db.staff, input.recipientId, "Communication recipient");
  const row = {
    id: newId(tx, "rdc"),
    reportId,
    recipientId: input.recipientId,
    method: input.method,
    outcome: requireText(input.outcome, "Communication outcome"),
    communicatedById: tx.actorId,
    communicatedAt: nowIso(tx),
    notes: input.notes?.trim() ?? "",
  };
  tx.db.radiologyCommunications.push(row);
  return row;
}

export function finaliseRadiologyReport(
  tx: Tx,
  reportId: ID,
  preliminary = false
) {
  const report = must(tx.db.radiologyReports, reportId, "Radiology report");
  assert(report.status === "DRAFT", "Only a draft report can be released.");
  if (report.criticality === "CRITICAL")
    assert(
      tx.db.radiologyCommunications.some(row => row.reportId === report.id),
      "Record critical-result communication before finalising."
    );
  report.status = preliminary ? "PRELIMINARY" : "FINAL";
  report.finalisedAt = nowIso(tx);
  const order = must(tx.db.radiologyOrders, report.orderId, "Radiology order");
  order.status = preliminary ? "PRELIMINARY" : "FINAL";
  touch(tx, order);
  if (report.criticality === "CRITICAL") {
    const communication = tx.db.radiologyCommunications.find(
      row => row.reportId === report.id
    )!;
    sendAlert(tx, {
      audience: "STAFF",
      audienceId: communication.recipientId,
      category: "Radiology",
      subject: `Critical imaging finding · ${order.accessionNumber}`,
      message: report.impression,
      priority: "CRITICAL",
      acknowledgementRequired: true,
    });
  }
  log(tx, {
    entityType: "radiology",
    entityId: order.id,
    patientId: order.patientId,
    action: "reported",
    summary: `${order.accessionNumber} report ${preliminary ? "released preliminarily" : "finalised"}`,
  });
  return report;
}

export function amendRadiologyReport(
  tx: Tx,
  reportId: ID,
  input: {
    findings: string;
    impression: string;
    recommendations?: string;
    reason: string;
  }
) {
  const previous = must(tx.db.radiologyReports, reportId, "Radiology report");
  assert(
    ["FINAL", "AMENDED"].includes(previous.status),
    "Only a final report can be amended."
  );
  const order = must(
    tx.db.radiologyOrders,
    previous.orderId,
    "Radiology order"
  );
  const report = {
    ...previous,
    id: newId(tx, "rdr"),
    version: previous.version + 1,
    status: "AMENDED" as const,
    findings: requireText(input.findings, "Findings"),
    impression: requireText(input.impression, "Impression"),
    recommendations: input.recommendations?.trim() ?? "",
    radiologistId: tx.actorId,
    createdAt: nowIso(tx),
    finalisedAt: nowIso(tx),
    supersedesId: previous.id,
  };
  requireText(input.reason, "Amendment reason");
  tx.db.radiologyReports.push(report);
  order.status = "AMENDED";
  touch(tx, order);
  return report;
}

export function acknowledgeRadiologyCommunication(tx: Tx, communicationId: ID) {
  const row = must(
    tx.db.radiologyCommunications,
    communicationId,
    "Critical-result communication"
  );
  assert(!row.acknowledgedAt, "This finding has already been acknowledged.");
  assert(
    row.recipientId === tx.actorId,
    "Only the notified clinician can acknowledge this finding."
  );
  row.acknowledgedById = tx.actorId;
  row.acknowledgedAt = nowIso(tx);
  return row;
}

export function cancelRadiologyOrder(tx: Tx, orderId: ID, reason: string) {
  const order = must(tx.db.radiologyOrders, orderId, "Radiology order");
  assert(
    ["ORDERED", "SCHEDULED", "CHECKED_IN", "READY"].includes(order.status),
    "An acquired study cannot be cancelled."
  );
  withdrawCharges(tx, "RADIOLOGY_ORDER", [order.id]);
  order.status = "CANCELLED";
  order.cancelReason = requireText(reason, "Cancellation reason");
  order.cancelledAt = nowIso(tx);
  touch(tx, order);
  return order;
}

export function recordRadiologyEquipmentEvent(
  tx: Tx,
  equipmentId: ID,
  input: {
    type:
      "QA" | "CALIBRATION" | "MAINTENANCE" | "DOWNTIME" | "RETURN_TO_SERVICE";
    status: "DUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    result?: string;
  }
) {
  const equipment = must(
    tx.db.radiologyEquipment,
    equipmentId,
    "Imaging equipment"
  );
  const row = {
    id: newId(tx, "rde"),
    equipmentId,
    ...input,
    result: input.result?.trim() ?? "",
    recordedById: tx.actorId,
    scheduledAt: nowIso(tx),
    completedAt: input.status === "COMPLETED" ? nowIso(tx) : undefined,
  };
  tx.db.radiologyEquipmentEvents.push(row);
  if (input.type === "DOWNTIME") equipment.status = "OUT_OF_SERVICE";
  if (input.type === "RETURN_TO_SERVICE") equipment.status = "ACTIVE";
  touch(tx, equipment);
  return row;
}
