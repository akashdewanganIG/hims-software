import { useView } from "@/lib/api/client";

export * from "./views";

export function useAlerts(params: {
  box: "inbox" | "sent";
  q?: string;
  category?: string;
  priority?: string;
  unreadOnly?: boolean;
}) {
  return useView("alerts.list", params, { refetchInterval: 15_000 });
}

export function useAlertSummary() {
  return useView("alerts.summary", {}, { refetchInterval: 15_000 });
}

export function useAlertComposer() {
  return useView("alerts.composer", {});
}
