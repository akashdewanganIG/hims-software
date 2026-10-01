/** React Query hooks over the patients views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";
import type { PatientFilter } from "./views";

export * from "./views";

export function usePatients(filters: { q?: string; filter: PatientFilter }) {
  return useView("patients.list", filters);
}

export function usePatientRecord(id: ID) {
  return useView("patients.record", { id });
}
