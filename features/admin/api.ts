/** React Query hooks over the user-management views (client components only). */
import { useView } from "@/lib/api/client";

export * from "./views";

export function useAdminUsers(filters: {
  q?: string;
  roleId?: string;
  status?: string;
}) {
  return useView("admin.users", filters);
}

export function useAdminRoles() {
  return useView("admin.roles", {});
}

export function useAccessAudit(limit = 100) {
  return useView("admin.audit", { limit });
}
