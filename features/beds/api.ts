/** React Query hooks over the beds views (client components only). */
import { useView } from "@/lib/api/client";

export * from "./views";

export function useBedBoard() {
  return useView("beds.board", {}, { refetchInterval: 30_000 });
}
