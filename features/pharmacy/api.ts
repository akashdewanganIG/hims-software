/** React Query hooks over the pharmacy views (client components only). */
import { useView } from "@/lib/api/client";
import type { ID } from "@/lib/sim/schema";

export * from "./views";

export function usePrescriptionQueue(filters: {
  view: "open" | "today" | "all";
  q?: string;
}) {
  return useView("pharmacy.queue", filters, { refetchInterval: 30_000 });
}

export function useDispenseDetail(id: ID | null) {
  return useView("pharmacy.prescription", { id }, { enabled: Boolean(id) });
}

export function useInventory() {
  return useView("pharmacy.inventory", {});
}

export function useTransactions(filters: {
  type?: string;
  q?: string;
  days: number;
}) {
  return useView("pharmacy.transactions", filters);
}
