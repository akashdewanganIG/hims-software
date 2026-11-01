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
  from: string;
  to: string;
}) {
  return useView("feedback.list", filters);
}

export function useFeedbackSummary(range: { from: string; to: string }) {
  return useView("feedback.summary", range);
}

export function useFeedbackRequests(filters: {
  status?: string;
  q?: string;
  from: string;
  to: string;
}) {
  return useView("feedback.requests", filters);
}

export function usePatientEncounters(patientId?: ID) {
  return useView(
    "feedback.patientEncounters",
    { patientId: patientId ?? "" },
    { enabled: Boolean(patientId) }
  );
}
