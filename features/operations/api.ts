/** React Query hooks over the operations views (client components only). */
import { useView } from "@/lib/api/client";

export * from "./views";

export function useOperations() {
  return useView(
    "operations.overview",
    {},
    {
      refetchInterval: 30_000,
    }
  );
}
