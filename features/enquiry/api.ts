/** React Query hooks over the enquiry views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";
import type { EnquiryView } from "./views";

export * from "./views";

export function useEnquiries(filters: {
  view: EnquiryView;
  q?: string;
  source?: string;
  type?: string;
}) {
  return useView("enquiry.list", filters);
}

export function useEnquirySummary() {
  return useView("enquiry.summary", {});
}

export function useEnquiry(id: ID | null) {
  return useView("enquiry.detail", { id }, { enabled: Boolean(id) });
}
