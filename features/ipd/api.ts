/** React Query hooks over the ipd views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";

export * from "./views";

export function useAdmissions(filters: {
  scope: "inhouse" | "discharged" | "all";
  q?: string;
  wardCode?: string;
  doctorId?: ID;
}) {
  return useView("ipd.admissions", filters);
}

export function useAdmission(id: ID) {
  return useView("ipd.admission", { id });
}

export function useFreeBeds() {
  return useView("ipd.freeBeds", {});
}
