/** React Query hooks over the mrd views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";
import type { MrdView } from "./views";

export * from "./views";

export function useMedicalRecords(filters: {
  view: MrdView;
  q?: string;
  type?: string;
}) {
  return useView("mrd.records", filters);
}

export function useMrdSummary() {
  return useView("mrd.summary", {});
}

export function useMedicalRecord(id: ID | null) {
  return useView("mrd.record", { id }, { enabled: Boolean(id) });
}
