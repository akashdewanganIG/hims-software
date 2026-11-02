import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";

export * from "./views";

export function useRadiologyWorklist(filters: {
  stage: "waiting" | "acquisition" | "reporting" | "completed" | "all";
  q?: string;
  modality?: string;
}) {
  return useView("radiology.worklist", filters);
}

export function useRadiologySummary() {
  return useView("radiology.summary", {});
}

export function useRadiologyOrder(id: ID | null) {
  return useView("radiology.order", { id }, { enabled: Boolean(id) });
}

export function useRadiologySchedule(date: string) {
  return useView("radiology.schedule", { date });
}

export function useRadiologyEquipment() {
  return useView("radiology.equipment", {});
}

export function useRadiologyCatalog() {
  return useView("radiology.catalog", {});
}
