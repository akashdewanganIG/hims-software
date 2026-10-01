import type { Encounter, ID } from "../sim/schema";
import { DomainError, find, log, must, touch, type Tx } from "../sim/tx";

/**
 * Orders (labs, prescriptions) attach to a live encounter only: an OPD visit
 * that is still open, or an admission that has not been discharged.
 */
export function assertEncounterAcceptsOrders(
  tx: Tx,
  encounter: Encounter,
  options: { allowDischargePending?: boolean } = {}
) {
  if (encounter.type === "OPD") {
    if (encounter.status !== "OPEN") {
      throw new DomainError(
        "This OPD visit is closed. Start a new visit to place orders."
      );
    }
    return;
  }
  const admission = must(tx.db.admissions, encounter.admissionId, "Admission");
  if (admission.status === "DISCHARGED") {
    throw new DomainError(
      `Admission ${admission.code} is discharged; it cannot take new orders.`
    );
  }
  if (
    admission.status === "DISCHARGE_PENDING" &&
    !options.allowDischargePending
  ) {
    throw new DomainError(
      `Admission ${admission.code} is pending discharge. Only discharge medication can be prescribed now.`
    );
  }
}

/** First clinical activity moves a fresh admission from Admitted to Active. */
export function activateAdmission(tx: Tx, admissionId: ID) {
  const admission = find(tx.db.admissions, admissionId);
  if (admission && admission.status === "ADMITTED") {
    admission.status = "ACTIVE";
    touch(tx, admission);
    log(tx, {
      entityType: "admission",
      entityId: admission.id,
      patientId: admission.patientId,
      action: "active",
      summary: `${admission.code} under active treatment`,
    });
  }
}
