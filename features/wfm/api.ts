/** React Query hooks over the wfm views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";

export * from "./views";

export function useStaffList(filters: {
  q?: string;
  departmentId?: string;
  role?: string;
  status?: string;
}) {
  return useView("wfm.staff", filters);
}

export function useStaffProfile(id: ID | null) {
  return useView("wfm.profile", { id }, { enabled: Boolean(id) });
}

export function useRoster(filters: {
  weekStart: string;
  departmentId?: string;
  role?: string;
}) {
  return useView("wfm.roster", filters);
}
