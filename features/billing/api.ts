/** React Query hooks over the billing views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";
import type { BillView } from "./views";

export * from "./views";

export function useInvoices(filters: {
  view: BillView;
  q?: string;
  setting?: string;
  days?: number;
}) {
  return useView("billing.invoices", filters);
}

export function useBillingSummary() {
  return useView("billing.summary", {});
}

export function useInvoice(id: ID) {
  return useView("billing.invoice", { id });
}

export function useCollections(date: string) {
  return useView("billing.collections", { date });
}
