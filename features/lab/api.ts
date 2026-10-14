/** React Query hooks over the lab views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";
import type { LabStage } from "./views";

export * from "./views";

export function useLabWorklist(filters: {
  stage: LabStage;
  q?: string;
  priority?: string;
}) {
  return useView("lab.worklist", filters, { refetchInterval: 30_000 });
}

export function useLabOrderDetail(id: ID | null) {
  return useView("lab.order", { id }, { enabled: Boolean(id) });
}

/** A patient's live admission and open OPD visits, to file a new order to. */
export function useLabOrderTargets(patientId: ID | null) {
  return useView(
    "lab.orderTargets",
    { patientId: patientId ?? "" },
    { enabled: Boolean(patientId) }
  );
}
