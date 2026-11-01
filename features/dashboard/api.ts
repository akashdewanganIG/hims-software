/** React Query hooks over the dashboard views (client components only). */
import { useView } from "@/lib/api/client";

export * from "./views";

/** Work queues for the signed-in member of staff (role and id come from the session). */
export function useDashboard() {
  return useView("dashboard.home", {}, { refetchInterval: 30_000 });
}

export function useDashboardTrend(range: { from: string; to: string }) {
  return useView("dashboard.trend", range, { refetchInterval: 60_000 });
}
