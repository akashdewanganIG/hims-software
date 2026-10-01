/** React Query hooks over the quality views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";

export * from "./views";

export function useComplaints(filters: {
  view: "open" | "overdue" | "resolved" | "all";
  q?: string;
  departmentId?: string;
  priority?: string;
}) {
  return useView("complaints.list", filters);
}

export function useComplaintSummary() {
  return useView("complaints.summary", {});
}

export function useComplaint(id: ID | null) {
  return useView("complaints.detail", { id }, { enabled: Boolean(id) });
}

export function useFeedback(filters: {
  view: "all" | "followup" | "low" | "high";
  q?: string;
  departmentId?: string;
  days: number;
}) {
  return useView("feedback.list", filters);
}

export function useFeedbackSummary(days: number) {
  return useView("feedback.summary", { days });
}

export function usePatientEncounters(patientId?: ID) {
  return useView(
    "feedback.patientEncounters",
    { patientId: patientId ?? "" },
    { enabled: Boolean(patientId) }
  );
}
