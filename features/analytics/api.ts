/** React Query hooks over the analytics views (client components only). */
import { useView } from "@/lib/api/client";

export * from "./views";

export function useAnalytics(days: number) {
  return useView("analytics.overview", { days });
}
