/** React Query hooks over the opd views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";

export * from "./views";

export function useOpdDashboard(filters: { doctorId?: ID; departmentId?: ID }) {
  return useView("opd.dashboard", filters, { refetchInterval: 30_000 });
}

export function useAppointments(filters: {
  from: string;
  to: string;
  doctorId?: ID;
  status?: string;
  q?: string;
}) {
  return useView("opd.appointments", filters);
}

export function useDoctorOptions(date: string) {
  return useView("opd.doctorOptions", { date });
}

export function useDoctorSlots(doctorId: ID | undefined, date: string) {
  return useView(
    "opd.doctorSlots",
    { doctorId, date },
    { enabled: Boolean(doctorId) }
  );
}

export function usePatientSearch(query: string) {
  return useView("patients.search", { query });
}

export function useVisit(encounterId: ID) {
  return useView("opd.visit", { encounterId });
}

export function useMedicineOptions() {
  return useView("catalog.medicines", {});
}

export function useLabTestOptions() {
  return useView("catalog.labTests", {});
}

export function useDepartments() {
  return useView("catalog.departments", {});
}

export function useStaffOptions(roles?: string[]) {
  return useView("catalog.staff", { roles });
}

/** The waiting-area token display (refreshes itself). */
export function useTokenBoard() {
  return useView("opd.tokenBoard", {}, { refetchInterval: 10_000 });
}
