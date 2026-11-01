/** React Query hooks over the analytics views (client components only). */
import { useView } from "@/lib/api/client";

export * from "./views";

export function useAnalytics(range: { from: string; to: string }) {
  return useView("analytics.overview", range);
}
